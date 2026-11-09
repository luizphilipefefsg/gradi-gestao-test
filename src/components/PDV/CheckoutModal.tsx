import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  QrCode,
  Banknote,
  ReceiptText,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Percent,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { Cliente, FormaPagamento, ParcelaCrediario, Venda } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (venda: Venda) => void;
  cliente: Cliente | null;
  descontoInicial?: number;
  descontoPctInicial?: number;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  cliente,
  descontoInicial = 0,
  descontoPctInicial = 0,
}) => {
  const { vendaAtual, finalizarVendaAtual } = useStore();
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>('dinheiro');
  const [modoDesconto, setModoDesconto] = useState<'reais' | 'porcentagem'>('porcentagem');
  const [desconto, setDesconto] = useState<number>(descontoInicial || 0);
  const [descontoPct, setDescontoPct] = useState<number>(descontoPctInicial || 0);
  const [acrescimo, setAcrescimo] = useState<number>(0);
  const [observacoes, setObservacoes] = useState('');
  
  // Crediário custom installment state
  const [qtdParcelas, setQtdParcelas] = useState<number>(3);
  const [parcelasEditaveis, setParcelasEditaveis] = useState<
    { numero: number; valor: number; vencimento: string }[]
  >([]);
  const [erro, setErro] = useState('');

  const subtotal = vendaAtual.itens.reduce((acc, curr) => acc + curr.subtotal, 0);
  const totalAPagar = Math.max(0, subtotal - (desconto || 0) + (acrescimo || 0));

  useEffect(() => {
    if (isOpen) {
      if (descontoInicial > 0) {
        setDesconto(descontoInicial);
        const pct = subtotal > 0 ? Math.round(((descontoInicial / subtotal) * 100) * 10) / 10 : 0;
        setDescontoPct(pct);
      } else if (descontoPctInicial > 0) {
        setDescontoPct(descontoPctInicial);
        const val = Math.round(((subtotal * descontoPctInicial) / 100) * 100) / 100;
        setDesconto(val);
      }
    }
  }, [isOpen, descontoInicial, descontoPctInicial, subtotal]);

  const handleDescontoPctChange = (pct: number) => {
    const safePct = Math.max(0, Math.min(100, pct));
    setDescontoPct(safePct);
    const val = Math.round(((subtotal * safePct) / 100) * 100) / 100;
    setDesconto(val);
  };

  const handleDescontoReaisChange = (val: number) => {
    const safeVal = Math.max(0, Math.min(subtotal, val));
    setDesconto(safeVal);
    const pct = subtotal > 0 ? Math.round(((safeVal / subtotal) * 100) * 10) / 10 : 0;
    setDescontoPct(pct);
  };

  const aplicarDescontoRapido = (pct: number) => {
    handleDescontoPctChange(pct);
  };

  // Generate initial editable installments whenever total or qtdParcelas changes
  useEffect(() => {
    if (totalAPagar <= 0) return;

    const baseVal = Math.floor((totalAPagar / qtdParcelas) * 100) / 100;
    const sobra = Math.round((totalAPagar - baseVal * qtdParcelas) * 100) / 100;

    const hoje = new Date();
    const novasParcelas = Array.from({ length: qtdParcelas }, (_, idx) => {
      // 30 days interval for each installment
      const d = new Date(hoje);
      d.setDate(d.getDate() + 30 * (idx + 1));
      const vencStr = d.toISOString().split('T')[0];

      // Add cents remainder to the last installment
      const val = idx === qtdParcelas - 1 ? Math.round((baseVal + sobra) * 100) / 100 : baseVal;

      return {
        numero: idx + 1,
        valor: val,
        vencimento: vencStr,
      };
    });

    setParcelasEditaveis(novasParcelas);
  }, [totalAPagar, qtdParcelas]);

  if (!isOpen) return null;

  // Sum of custom installments
  const somaParcelas = parcelasEditaveis.reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
  const diferencaCrediario = Math.round((totalAPagar - somaParcelas) * 100) / 100;

  const handleUpdateParcelaValor = (index: number, novoValor: number) => {
    setParcelasEditaveis(prev =>
      prev.map((p, idx) => (idx === index ? { ...p, valor: Math.max(0, novoValor) } : p))
    );
  };

  const handleUpdateParcelaData = (index: number, novaData: string) => {
    setParcelasEditaveis(prev =>
      prev.map((p, idx) => (idx === index ? { ...p, vencimento: novaData } : p))
    );
  };

  const ajustarDiferencaNaUltimaParcela = () => {
    if (parcelasEditaveis.length === 0) return;
    const lastIdx = parcelasEditaveis.length - 1;
    const somaExcetoUltima = parcelasEditaveis
      .slice(0, lastIdx)
      .reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
    const novoValorUltima = Math.max(0, Math.round((totalAPagar - somaExcetoUltima) * 100) / 100);

    setParcelasEditaveis(prev =>
      prev.map((p, idx) => (idx === lastIdx ? { ...p, valor: novoValorUltima } : p))
    );
  };

  const redistribuirParcelasIguais = () => {
    const baseVal = Math.floor((totalAPagar / qtdParcelas) * 100) / 100;
    const sobra = Math.round((totalAPagar - baseVal * qtdParcelas) * 100) / 100;

    setParcelasEditaveis(prev =>
      prev.map((p, idx) => ({
        ...p,
        valor: idx === qtdParcelas - 1 ? Math.round((baseVal + sobra) * 100) / 100 : baseVal,
      }))
    );
  };

  const handleFinalizar = () => {
    setErro('');

    if (formaPagamento === 'crediario') {
      if (!cliente) {
        setErro('Para vender no crediário, você precisa selecionar ou cadastrar o cliente na sacola!');
        return;
      }

      // Check sum of custom installments
      if (Math.abs(diferencaCrediario) > 0.05) {
        setErro(
          `A soma das parcelas (${formatCurrency(somaParcelas)}) deve bater exatamente com o total da venda (${formatCurrency(totalAPagar)}). Clique em "Ajustar diferença" para acertar os centavos.`
        );
        return;
      }
    }

    let parcelasFinal: ParcelaCrediario[] | undefined = undefined;
    if (formaPagamento === 'crediario' && cliente) {
      parcelasFinal = parcelasEditaveis.map(p => ({
        id: `parc-${Date.now()}-${p.numero}`,
        venda_id: vendaAtual.id,
        cliente_id: cliente.id,
        numero_parcela: p.numero,
        total_parcelas: parcelasEditaveis.length,
        valor: p.valor,
        data_vencimento: p.vencimento,
        status: 'pendente',
        valor_pago: 0,
      }));
    }

    const resultado = finalizarVendaAtual(
      formaPagamento,
      parcelasFinal,
      desconto,
      acrescimo,
      observacoes
    );

    if (!resultado.success) {
      setErro(resultado.message || 'Erro ao finalizar venda.');
      return;
    }

    if (resultado.vendaFinalizada) {
      onSuccess(resultado.vendaFinalizada);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-purple-100 my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#280F4D] via-[#351465] to-[#481B84] px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/15 text-white rounded-xl backdrop-blur-xs">
              <ReceiptText className="w-5 h-5 text-purple-200" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg">Finalizar Pagamento</h3>
              <p className="text-xs text-purple-200">
                Venda Nº: <span className="font-mono font-bold text-white">{vendaAtual.codigo_venda}</span> |{' '}
                {vendaAtual.itens.length} {vendaAtual.itens.length === 1 ? 'peça' : 'peças'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {erro && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          {/* Totals & Complete Discount Section */}
          <div className="bg-purple-50/60 p-4 rounded-2xl border border-purple-200/90 space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
              <div>
                <span className="text-xs text-slate-500 block font-medium">Subtotal dos Itens</span>
                <span className="text-lg font-bold text-slate-800">{formatCurrency(subtotal)}</span>
              </div>

              {/* Desconto Duplo: % e R$ */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-purple-900 flex items-center gap-1">
                    <Percent className="w-3.5 h-3.5 text-purple-600" />
                    <span>Desconto</span>
                  </label>
                  <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-purple-200 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setModoDesconto('porcentagem')}
                      className={`px-1.5 py-0.5 rounded cursor-pointer ${
                        modoDesconto === 'porcentagem'
                          ? 'bg-[#351465] text-white'
                          : 'text-slate-600 hover:text-purple-900'
                      }`}
                    >
                      % Porcentagem
                    </button>
                    <button
                      type="button"
                      onClick={() => setModoDesconto('reais')}
                      className={`px-1.5 py-0.5 rounded cursor-pointer ${
                        modoDesconto === 'reais'
                          ? 'bg-[#351465] text-white'
                          : 'text-slate-600 hover:text-purple-900'
                      }`}
                    >
                      R$ Valor
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {/* Input Porcentagem */}
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={descontoPct || ''}
                      onChange={e => handleDescontoPctChange(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className={`w-full pl-2.5 pr-6 py-1.5 bg-white border rounded-xl text-xs font-bold outline-hidden ${
                        modoDesconto === 'porcentagem'
                          ? 'border-purple-500 ring-2 ring-purple-300/40 text-purple-950'
                          : 'border-slate-300 text-slate-700'
                      }`}
                      title="Desconto em porcentagem (%)"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      %
                    </span>
                  </div>

                  {/* Input Reais */}
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max={subtotal}
                      step="0.50"
                      value={desconto || ''}
                      onChange={e => handleDescontoReaisChange(parseFloat(e.target.value) || 0)}
                      placeholder="0,00"
                      className={`w-full pl-6 pr-2 py-1.5 bg-white border rounded-xl text-xs font-bold outline-hidden ${
                        modoDesconto === 'reais'
                          ? 'border-purple-500 ring-2 ring-purple-300/40 text-purple-950'
                          : 'border-slate-300 text-slate-700'
                      }`}
                      title="Desconto em reais (R$)"
                    />
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                      R$
                    </span>
                  </div>
                </div>
              </div>

              {/* Total Final a Pagar */}
              <div className="sm:text-right">
                <span className="text-xs text-purple-950 block font-black uppercase tracking-wider">
                  Total a Pagar
                </span>
                <span className="text-2xl font-black text-[#280F4D]">
                  {formatCurrency(totalAPagar)}
                </span>
                {desconto > 0 && (
                  <span className="block text-[11px] font-bold text-emerald-700">
                    Desconto: -{formatCurrency(desconto)} ({descontoPct.toFixed(1)}%)
                  </span>
                )}
              </div>
            </div>

            {/* Botões Rápidos de Porcentagem */}
            <div className="pt-2 border-t border-purple-200/70 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                <span>Descontos Rápidos (%):</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {[5, 10, 15, 20, 30, 50].map(pct => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => aplicarDescontoRapido(pct)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      Math.abs(descontoPct - pct) < 0.1
                        ? 'bg-[#280F4D] text-white shadow-2xs'
                        : 'bg-white hover:bg-purple-100 text-[#280F4D] border border-purple-200'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
                {desconto > 0 && (
                  <button
                    type="button"
                    onClick={() => aplicarDescontoRapido(0)}
                    className="px-2 py-1 rounded-lg text-[11px] font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors cursor-pointer"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Selecione a Forma de Pagamento
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { id: 'dinheiro', label: 'Dinheiro', icon: Banknote },
                { id: 'pix', label: 'Pix Instantâneo', icon: QrCode },
                { id: 'cartao_debito', label: 'Cartão Débito', icon: CreditCard },
                { id: 'cartao_credito', label: 'Cartão Crédito', icon: CreditCard },
                { id: 'crediario', label: 'Crediário Loja', icon: ReceiptText },
              ].map(opt => {
                const Icon = opt.icon;
                const isSelected = formaPagamento === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFormaPagamento(opt.id as FormaPagamento)}
                    className={`p-3 rounded-xl border text-center flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#351465] bg-[#351465] text-white font-bold shadow-xs'
                        : 'border-slate-200 hover:border-purple-200 bg-white text-slate-700'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                    <span className="text-xs leading-tight">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Specific Crediário Module - 100% Editable installments */}
          {formaPagamento === 'crediario' && (
            <div className="bg-purple-50/60 border border-purple-200 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-purple-200">
                <div>
                  <h4 className="font-bold text-purple-950 flex items-center gap-1.5 text-sm">
                    <ReceiptText className="w-4 h-4 text-purple-700" />
                    Crediário Próprio (Carnê da Loja)
                  </h4>
                  <p className="text-xs text-purple-800">
                    Você pode alterar manualmente o valor e a data de vencimento de qualquer parcela.
                  </p>
                </div>

                {cliente ? (
                  <div className="text-left sm:text-right bg-white p-2 rounded-xl border border-purple-200">
                    <span className="text-xs text-slate-500">Cliente: </span>
                    <strong className="text-xs text-purple-900">{cliente.nome}</strong>
                    <div className="text-[11px] text-slate-500">
                      Crediário:{' '}
                      <span className="font-bold text-emerald-700">
                        Liberado
                      </span>
                      {cliente.saldo_devedor > 0 && (
                        <span className="block text-[10px] text-amber-700">
                          Débito: {formatCurrency(cliente.saldo_devedor)}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <span className="text-xs bg-rose-100 text-rose-700 px-2.5 py-1 rounded-lg font-bold">
                    ⚠️ Selecione o cliente no topo da sacola
                  </span>
                )}
              </div>

              {/* Installments count selector */}
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-bold text-purple-950">Número de Parcelas:</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5, 6].map(num => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setQtdParcelas(num)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                        qtdParcelas === num
                          ? 'bg-[#351465] text-white shadow-xs'
                          : 'bg-white border border-purple-200 text-purple-900 hover:bg-purple-100'
                      }`}
                    >
                      {num}x
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={redistribuirParcelasIguais}
                  className="text-xs text-purple-700 hover:text-purple-950 underline font-semibold ml-auto"
                >
                  Dividir Igualmente
                </button>
              </div>

              {/* Editable Installments Table */}
              <div className="space-y-2 bg-white p-3 rounded-xl border border-purple-200">
                <div className="grid grid-cols-12 text-[11px] font-bold text-slate-500 uppercase px-2">
                  <div className="col-span-2">Parcela</div>
                  <div className="col-span-5">Data de Vencimento</div>
                  <div className="col-span-5">Valor da Parcela (R$)</div>
                </div>

                {parcelasEditaveis.map((parc, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 items-center gap-2 p-1.5 hover:bg-purple-50/50 rounded-lg transition-colors"
                  >
                    <div className="col-span-2 font-bold text-xs text-slate-800 flex items-center gap-1">
                      <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-800 flex items-center justify-center text-[10px]">
                        {parc.numero}ª
                      </span>
                    </div>
                    <div className="col-span-5">
                      <div className="relative">
                        <Calendar className="w-3.5 h-3.5 text-purple-400 absolute left-2.5 top-2" />
                        <input
                          type="date"
                          value={parc.vencimento}
                          onChange={e => handleUpdateParcelaData(idx, e.target.value)}
                          className="w-full pl-8 pr-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500 outline-hidden font-medium text-slate-800"
                        />
                      </div>
                    </div>
                    <div className="col-span-5">
                      <div className="relative">
                        <span className="absolute left-2.5 top-1 text-xs text-slate-400 font-medium">
                          R$
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={parc.valor}
                          onChange={e =>
                            handleUpdateParcelaValor(idx, parseFloat(e.target.value) || 0)
                          }
                          className="w-full pl-8 pr-2 py-1 text-xs font-bold text-slate-900 border border-slate-300 rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500 outline-hidden text-right"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {/* Checksum & Difference Indicator */}
                <div className="mt-2 pt-2 border-t border-purple-100 flex flex-wrap items-center justify-between text-xs px-2 gap-2">
                  <div className="flex items-center gap-2">
                    {Math.abs(diferencaCrediario) < 0.05 ? (
                      <span className="flex items-center gap-1 text-emerald-700 font-bold">
                        <CheckCircle2 className="w-4 h-4" /> Soma exata ({formatCurrency(somaParcelas)})
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-rose-600 font-bold">
                        <AlertCircle className="w-4 h-4" /> Diferença: {formatCurrency(diferencaCrediario)}
                      </span>
                    )}
                  </div>

                  {Math.abs(diferencaCrediario) >= 0.05 && (
                    <button
                      type="button"
                      onClick={ajustarDiferencaNaUltimaParcela}
                      className="px-2.5 py-1 bg-[#351465] hover:bg-[#280F4D] text-white rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      Ajustar diferença na {parcelasEditaveis.length}ª parcela
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Observações da Venda */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Observações do Pedido (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ex: Peças para presente / Retirada pelo filho"
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs outline-hidden focus:ring-2 focus:ring-purple-400"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="bg-purple-50/40 px-6 py-4 flex items-center justify-between border-t border-purple-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:text-slate-900 text-xs font-semibold transition-colors"
          >
            Voltar ao Balcão
          </button>

          <button
            type="button"
            onClick={handleFinalizar}
            className="px-6 py-2.5 bg-gradient-to-r from-[#280F4D] to-[#481B84] hover:from-[#1d0938] hover:to-[#3b156e] text-white text-xs font-bold rounded-xl shadow-md shadow-[#280F4D]/25 transition-all flex items-center gap-2 hover:scale-[1.01] active:scale-[0.99]"
          >
            <CheckCircle2 className="w-4 h-4" />
            Concluir Venda ({formatCurrency(totalAPagar)})
          </button>
        </div>
      </div>
    </div>
  );
};
