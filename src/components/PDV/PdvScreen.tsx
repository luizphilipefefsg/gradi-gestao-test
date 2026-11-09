import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Search,
  Barcode,
  ShoppingBag,
  Trash2,
  Plus,
  Minus,
  User,
  UserPlus,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  X,
  Sparkles,
  Clock,
  FileText,
  Zap,
  Tag,
  Check,
  Layers,
  ChevronDown,
  Percent,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { Cliente, Produto, ProdutoGrade, Venda, ItemVenda } from '../../types';
import { formatCurrency, formatWhatsApp } from '../../utils/formatters';
import { QuickCustomerModal } from './QuickCustomerModal';
import { CheckoutModal } from './CheckoutModal';
import { ReceiptModal } from './ReceiptModal';

interface VendaEmEspera {
  id: string;
  codigo_venda: string;
  cliente_id?: string;
  cliente_nome: string;
  itens: ItemVenda[];
  subtotal: number;
  criadoEm: string;
}

export const PdvScreen: React.FC = () => {
  const {
    produtos,
    clientes,
    vendaAtual,
    adicionarItemVendaAtual,
    removerItemVendaAtual,
    alterarQuantidadeItemVendaAtual,
    cancelarVendaAtual,
    vincularClienteVendaAtual,
    finalizarVendaAtual,
  } = useStore();

  const [busca, setBusca] = useState('');
  const [tabelaPreco, setTabelaPreco] = useState<'varejo' | 'atacado' | 'promocional'>('varejo');
  const [toastMsg, setToastMsg] = useState<{ tipo: 'sucesso' | 'erro' | 'info'; texto: string } | null>(null);

  // Modals state
  const [isQuickCustomerOpen, setIsQuickCustomerOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isObsModalOpen, setIsObsModalOpen] = useState(false);
  const [isAguardandoModalOpen, setIsAguardandoModalOpen] = useState(false);
  const [isDescontoModalOpen, setIsDescontoModalOpen] = useState(false);
  const [descontoPercentual, setDescontoPercentual] = useState<number>(0);
  const [descontoValorManual, setDescontoValorManual] = useState<number>(0);
  const [observacoesVenda, setObservacoesVenda] = useState('');
  const [vendasEmEspera, setVendasEmEspera] = useState<VendaEmEspera[]>([]);
  const [vendaConcluidaParaRecibo, setVendaConcluidaParaRecibo] = useState<Venda | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const showToast = (tipo: 'sucesso' | 'erro' | 'info', texto: string) => {
    setToastMsg({ tipo, texto });
    setTimeout(() => {
      setToastMsg(null);
    }, 3200);
  };

  // Find associated customer
  const clienteSelecionado = clientes.find(c => c.id === vendaAtual.cliente_id) || null;

  // Flattened searchable list of clothing items with variations (Tamanho / Cor)
  // Each entry is a concrete piece that can be clicked to sell
  const todasVariacoes = useMemo(() => {
    const list: {
      produto: Produto;
      grade: ProdutoGrade;
      titulo: string;
      subtitulo: string;
      sku: string;
      codigo_barras: string;
      preco: number;
      estoque: number;
      categoria: string;
      referencia: string;
    }[] = [];

    produtos.forEach(prod => {
      prod.grades.forEach(g => {
        list.push({
          produto: prod,
          grade: g,
          titulo: `${prod.nome} (${g.tamanho} - ${g.cor})`,
          subtitulo: `Ref: ${prod.referencia} • Marca/Cat: ${prod.categoria}`,
          sku: g.sku,
          codigo_barras: g.codigo_barras,
          preco: prod.preco_venda,
          estoque: g.estoque_disponivel,
          categoria: prod.categoria,
          referencia: prod.referencia,
        });
      });
    });

    return list;
  }, [produtos]);

  // Letter by letter search filtering
  const termo = busca.trim().toLowerCase();
  const variacoesFiltradas = useMemo(() => {
    if (!termo) {
      // Show available items when search is empty (first 25)
      return todasVariacoes.slice(0, 30);
    }
    return todasVariacoes.filter(item => {
      return (
        item.titulo.toLowerCase().includes(termo) ||
        item.referencia.toLowerCase().includes(termo) ||
        item.categoria.toLowerCase().includes(termo) ||
        item.codigo_barras.includes(termo) ||
        item.sku.toLowerCase().includes(termo) ||
        item.grade.cor.toLowerCase().includes(termo) ||
        item.grade.tamanho.toLowerCase().includes(termo)
      );
    });
  }, [termo, todasVariacoes]);

  // Handle adding item via button or barcode
  const handleAddItem = (produto: Produto, grade: ProdutoGrade) => {
    const res = adicionarItemVendaAtual(produto, grade, 1);
    if (!res.success) {
      showToast('erro', res.message || 'Sem estoque disponível!');
    } else {
      showToast(
        'sucesso',
        `+1 ${produto.nome} (${grade.tamanho} - ${grade.cor}) adicionado!`
      );
    }
  };

  // Handle Enter key in search/barcode input:
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!termo) return;

    // 1. Exact match by barcode or SKU
    const matchExato = todasVariacoes.find(
      v =>
        v.codigo_barras === termo ||
        v.sku.toLowerCase() === termo
    );

    if (matchExato) {
      handleAddItem(matchExato.produto, matchExato.grade);
      setBusca('');
      return;
    }

    // 2. If single result found, add it
    if (variacoesFiltradas.length === 1) {
      const single = variacoesFiltradas[0];
      handleAddItem(single.produto, single.grade);
      setBusca('');
      return;
    }

    if (variacoesFiltradas.length === 0) {
      showToast('erro', `Nenhuma peça encontrada para "${busca}".`);
    }
  };

  const handleSelectCustomer = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cid = e.target.value;
    if (!cid) {
      vincularClienteVendaAtual(null);
    } else {
      const c = clientes.find(item => item.id === cid);
      if (c) vincularClienteVendaAtual(c);
    }
  };

  // Hold current sale (Aguardar - F7)
  const handleAguardarVenda = () => {
    if (vendaAtual.itens.length === 0) {
      showToast('info', 'Não há itens na venda atual para colocar em espera.');
      return;
    }

    const novaEmEspera: VendaEmEspera = {
      id: `espera-${Date.now()}`,
      codigo_venda: vendaAtual.codigo_venda,
      cliente_id: vendaAtual.cliente_id,
      cliente_nome: vendaAtual.cliente_nome,
      itens: [...vendaAtual.itens],
      subtotal: vendaAtual.subtotal,
      criadoEm: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };

    setVendasEmEspera(prev => [novaEmEspera, ...prev]);
    cancelarVendaAtual();
    showToast('sucesso', `Venda ${novaEmEspera.codigo_venda} colocada em espera (Aguardando).`);
  };

  // Resume held sale
  const handleRetomarVenda = (espera: VendaEmEspera) => {
    if (vendaAtual.itens.length > 0) {
      showToast('erro', 'Finalize ou cancele a venda atual antes de retomar uma venda em espera.');
      return;
    }

    // Re-link customer
    if (espera.cliente_id) {
      const cli = clientes.find(c => c.id === espera.cliente_id);
      if (cli) vincularClienteVendaAtual(cli);
    }

    // Re-add items
    espera.itens.forEach(item => {
      const prod = produtos.find(p => p.id === item.produto_id);
      if (prod) {
        const grade = prod.grades.find(g => g.id === item.grade_id);
        if (grade) {
          adicionarItemVendaAtual(prod, grade, item.quantidade);
        }
      }
    });

    setVendasEmEspera(prev => prev.filter(v => v.id !== espera.id));
    setIsAguardandoModalOpen(false);
    showToast('sucesso', `Venda ${espera.codigo_venda} retomada com sucesso!`);
  };

  // Finalizar Rápido (F8) -> Dinheiro ou Pix direto
  const handleFinalizarRapido = () => {
    if (vendaAtual.itens.length === 0) {
      showToast('info', 'Adicione produtos à venda antes de finalizar.');
      return;
    }
    const res = finalizarVendaAtual('dinheiro', undefined, 0, 0, observacoesVenda);
    if (res.success && res.vendaFinalizada) {
      setVendaConcluidaParaRecibo(res.vendaFinalizada);
      setObservacoesVenda('');
      showToast('sucesso', 'Venda rápida finalizada no Dinheiro!');
    } else {
      showToast('erro', res.message || 'Erro ao finalizar venda.');
    }
  };

  // Keyboard Shortcuts (F2, F5, F6, F7, F8, F11, F12)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F2: Cliente
      if (e.key === 'F2') {
        e.preventDefault();
        setIsQuickCustomerOpen(true);
      }
      // F5: Finalizar Venda
      else if (e.key === 'F5') {
        e.preventDefault();
        if (vendaAtual.itens.length > 0) {
          setIsCheckoutOpen(true);
        } else {
          showToast('info', 'Adicione produtos para finalizar.');
        }
      }
      // F6: Cancelar / Limpar Venda
      else if (e.key === 'F6') {
        e.preventDefault();
        if (vendaAtual.itens.length > 0) {
          cancelarVendaAtual();
          showToast('info', 'Venda cancelada e peças devolvidas ao estoque.');
        }
      }
      // F7: Aguardar / Colocar em espera
      else if (e.key === 'F7') {
        e.preventDefault();
        handleAguardarVenda();
      }
      // F8: Finalizar Rápido
      else if (e.key === 'F8') {
        e.preventDefault();
        handleFinalizarRapido();
      }
      // F9: Desconto (% ou R$)
      else if (e.key === 'F9') {
        e.preventDefault();
        setIsDescontoModalOpen(true);
      }
      // F11: Vendas em espera
      else if (e.key === 'F11') {
        e.preventDefault();
        setIsAguardandoModalOpen(true);
      }
      // F12: Observações
      else if (e.key === 'F12') {
        e.preventDefault();
        setIsObsModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [vendaAtual, observacoesVenda]);

  const totalPecas = vendaAtual.itens.reduce((acc, i) => acc + i.quantidade, 0);

  // Pricing multiplier & Manual discount
  const precoMultiplicador = tabelaPreco === 'atacado' ? 0.9 : tabelaPreco === 'promocional' ? 0.95 : 1;
  const subtotalBase = vendaAtual.subtotal * (tabelaPreco === 'varejo' ? 1 : precoMultiplicador);
  const valorDescontoManual =
    descontoPercentual > 0
      ? Math.round(((subtotalBase * descontoPercentual) / 100) * 100) / 100
      : Math.min(subtotalBase, descontoValorManual);
  const subtotalExibicao = Math.max(0, subtotalBase - valorDescontoManual);

  return (
    <div className="space-y-3 pb-8">
      {/* Toast Notification */}
      {toastMsg && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-2 text-xs font-bold transition-all duration-200 animate-in fade-in slide-in-from-bottom-3 ${
            toastMsg.tipo === 'sucesso'
              ? 'bg-[#280F4D] text-purple-100 border-[#481B84]'
              : toastMsg.tipo === 'info'
              ? 'bg-[#351465] text-purple-100 border-purple-400'
              : 'bg-rose-950 text-rose-100 border-rose-700'
          }`}
        >
          {toastMsg.tipo === 'sucesso' ? (
            <ShieldCheck className="w-4 h-4 text-purple-300 shrink-0" />
          ) : toastMsg.tipo === 'info' ? (
            <Clock className="w-4 h-4 text-purple-300 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{toastMsg.texto}</span>
        </div>
      )}

      {/* PAINEL PRINCIPAL EM 2 COLUNAS (LAYOUT CONFORME A IMAGEM DE REFERÊNCIA) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        {/* ========================================================
            COLUNA ESQUERDA: PESQUISA + LISTA DE PRODUTOS + TECLAS F
           ======================================================== */}
        <div className="lg:col-span-6 flex flex-col space-y-3">
          
          {/* 1. CAMPO DE PESQUISA (TOP ESQUERDA) */}
          <div className="bg-white rounded-2xl border-2 border-purple-200 focus-within:border-[#351465] shadow-xs p-2.5 transition-all">
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-5 h-5 text-[#351465] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Pesquisar por nome, ref, cor ou bipar código..."
                  className="w-full pl-10 pr-8 py-2 bg-purple-50/20 rounded-xl text-sm font-semibold text-slate-900 placeholder-slate-400 outline-hidden"
                />
                {busca && (
                  <button
                    type="button"
                    onClick={() => {
                      setBusca('');
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                className="px-3.5 py-2 bg-[#351465] hover:bg-[#280F4D] text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0 shadow-2xs"
                title="Bipar / Inserir"
              >
                <Barcode className="w-4 h-4" />
                <span>Bipar</span>
              </button>
            </form>
          </div>

          {/* 2. LISTA DE PRODUTOS / RESULTADOS DINÂMICOS (MEIO ESQUERDA) */}
          <div className="bg-white rounded-2xl border border-purple-100 shadow-xs overflow-hidden flex flex-col h-[460px]">
            {/* Header da listagem com contador */}
            <div className="px-4 py-2.5 bg-purple-50/70 border-b border-purple-100 flex items-center justify-between text-xs">
              <span className="font-bold text-[#280F4D] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#351465]" />
                {termo ? `Buscando por "${busca}":` : 'Peças Disponíveis no Estoque:'}
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                {variacoesFiltradas.length} {variacoesFiltradas.length === 1 ? 'peça' : 'peças'}
              </span>
            </div>

            {/* Lista rolável de itens de roupa */}
            <div className="flex-1 overflow-y-auto divide-y divide-purple-50/80">
              {variacoesFiltradas.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400 space-y-2">
                  <ShoppingBag className="w-10 h-10 stroke-1 text-purple-300" />
                  <p className="text-xs font-bold text-slate-600">Nenhum produto encontrado</p>
                  <p className="text-[11px] text-slate-400 max-w-xs">
                    Tente digitar outro termo, marca, cor ou bipe o código de barras da peça.
                  </p>
                </div>
              ) : (
                variacoesFiltradas.map((item, idx) => {
                  const semEstoque = item.estoque <= 0;
                  const isFirstMatch = termo && idx === 0;

                  return (
                    <div
                      key={`${item.produto.id}-${item.grade.id}`}
                      onClick={() => !semEstoque && handleAddItem(item.produto, item.grade)}
                      className={`p-3 transition-all cursor-pointer flex flex-col justify-between gap-1 group ${
                        isFirstMatch
                          ? 'bg-gradient-to-r from-[#351465] to-[#280F4D] text-white hover:opacity-95'
                          : 'hover:bg-purple-50/60 bg-white text-slate-800'
                      } ${semEstoque ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {/* Linha 1: Título e Preço */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4
                            className={`font-bold text-xs truncate ${
                              isFirstMatch ? 'text-white' : 'text-slate-900 group-hover:text-[#280F4D]'
                            }`}
                          >
                            {item.titulo}
                          </h4>
                        </div>
                        <span
                          className={`text-xs font-black shrink-0 ${
                            isFirstMatch ? 'text-amber-300' : 'text-[#280F4D]'
                          }`}
                        >
                          {formatCurrency(item.preco * precoMultiplicador)}
                        </span>
                      </div>

                      {/* Linha 2: Cód. Barras, Marca/Ref, Estoque */}
                      <div
                        className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono ${
                          isFirstMatch ? 'text-purple-200' : 'text-slate-500'
                        }`}
                      >
                        <span>
                          Cód. Barras: <strong>{item.codigo_barras || item.sku}</strong>
                        </span>
                        <span>
                          Marca: <strong>{item.categoria}</strong>
                        </span>
                        <span className="flex items-center gap-1">
                          Estoque:
                          <strong
                            className={`px-1.5 py-0.2 rounded font-sans text-[10px] ${
                              isFirstMatch
                                ? semEstoque
                                  ? 'bg-rose-500/80 text-white'
                                  : 'bg-emerald-500/80 text-white'
                                : semEstoque
                                ? 'bg-rose-100 text-rose-700'
                                : item.estoque <= 2
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {item.estoque} Un
                          </strong>
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 3. BOTÕES DE AÇÃO RÁPIDA / TECLAS F (BOTTOM ESQUERDA) */}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={handleAguardarVenda}
              className="py-2.5 px-1.5 bg-[#351465] hover:bg-[#280F4D] text-white rounded-xl text-xs font-bold shadow-xs transition-all flex flex-col items-center justify-center gap-0.5 active:scale-95 cursor-pointer"
            >
              <span>Aguardar</span>
              <span className="text-[10px] font-mono opacity-80">(F7)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (vendaAtual.itens.length > 0) {
                  cancelarVendaAtual();
                  setDescontoPercentual(0);
                  setDescontoValorManual(0);
                  showToast('info', 'Venda cancelada e peças devolvidas ao estoque.');
                } else {
                  showToast('info', 'A venda já está vazia.');
                }
              }}
              className="py-2.5 px-1.5 bg-[#351465] hover:bg-[#280F4D] text-white rounded-xl text-xs font-bold shadow-xs transition-all flex flex-col items-center justify-center gap-0.5 active:scale-95 cursor-pointer"
            >
              <span>Cancelar</span>
              <span className="text-[10px] font-mono opacity-80">(F6)</span>
            </button>

            <button
              type="button"
              onClick={handleFinalizarRapido}
              className="py-2.5 px-1.5 bg-[#351465] hover:bg-[#280F4D] text-white rounded-xl text-xs font-bold shadow-xs transition-all flex flex-col items-center justify-center gap-0.5 active:scale-95 cursor-pointer"
            >
              <span>Finalizar Rápido</span>
              <span className="text-[10px] font-mono opacity-80">(F8)</span>
            </button>

            {/* BOTÃO DESCONTO POR PORCENTAGEM (F9) */}
            <button
              type="button"
              onClick={() => setIsDescontoModalOpen(true)}
              className="py-2.5 px-1.5 bg-gradient-to-r from-[#280F4D] to-[#481B84] hover:opacity-95 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex flex-col items-center justify-center gap-0.5 active:scale-95 relative cursor-pointer"
              title="Aplicar desconto por porcentagem ou valor (F9)"
            >
              <div className="flex items-center gap-1">
                <Percent className="w-3.5 h-3.5 text-purple-200" />
                <span>Desconto</span>
                {descontoPercentual > 0 && (
                  <span className="w-4 h-4 bg-emerald-400 text-slate-900 rounded-full text-[10px] font-extrabold flex items-center justify-center">
                    %
                  </span>
                )}
              </div>
              <span className="text-[10px] font-mono opacity-80">
                {descontoPercentual > 0 ? `-${descontoPercentual}%` : '(F9)'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIsAguardandoModalOpen(true)}
              className="py-2.5 px-1.5 bg-[#351465] hover:bg-[#280F4D] text-white rounded-xl text-xs font-bold shadow-xs transition-all flex flex-col items-center justify-center gap-0.5 active:scale-95 relative cursor-pointer"
            >
              <div className="flex items-center gap-1">
                <span>Aguardando</span>
                {vendasEmEspera.length > 0 && (
                  <span className="w-4 h-4 bg-amber-400 text-slate-900 rounded-full text-[10px] font-extrabold flex items-center justify-center">
                    {vendasEmEspera.length}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-mono opacity-80">(F11)</span>
            </button>

            <button
              type="button"
              onClick={() => setIsQuickCustomerOpen(true)}
              className="py-2.5 px-1.5 bg-[#351465] hover:bg-[#280F4D] text-white rounded-xl text-xs font-bold shadow-xs transition-all flex flex-col items-center justify-center gap-0.5 active:scale-95 cursor-pointer"
            >
              <span>Cliente</span>
              <span className="text-[10px] font-mono opacity-80">(F2)</span>
            </button>

            <button
              type="button"
              onClick={() => setIsObsModalOpen(true)}
              className="py-2.5 px-1.5 bg-[#351465] hover:bg-[#280F4D] text-white rounded-xl text-xs font-bold shadow-xs transition-all flex flex-col items-center justify-center gap-0.5 active:scale-95 relative cursor-pointer"
            >
              <div className="flex items-center gap-1">
                <span>Obs.</span>
                {observacoesVenda && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                )}
              </div>
              <span className="text-[10px] font-mono opacity-80">(F12)</span>
            </button>
          </div>
        </div>

        {/* ========================================================
            COLUNA DIREITA: CLIENTE / TABELA + GRADE DE ITENS + TOTAIS
           ======================================================== */}
        <div className="lg:col-span-6 flex flex-col space-y-3">
          
          {/* 1. SELETORES SUPERIORES (TOP DIREITA: CLIENTE E TABELA DE PREÇOS) */}
          <div className="bg-white rounded-2xl border border-purple-100 shadow-xs p-3 space-y-2.5">
            {/* Linha 1: Cliente */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-[#280F4D] w-32 shrink-0">
                Cliente da venda:
              </span>
              <div className="flex-1 flex items-center gap-1.5">
                <div className="relative flex-1">
                  <select
                    value={vendaAtual.cliente_id || ''}
                    onChange={handleSelectCustomer}
                    className="w-full pl-3 pr-8 py-1.5 bg-purple-50/40 border border-purple-200 rounded-xl text-xs font-medium text-slate-800 outline-hidden focus:border-[#351465] cursor-pointer"
                  >
                    <option value="">Consumidor Balcão (Não identificado)</option>
                    {clientes.map(cli => (
                      <option key={cli.id} value={cli.id}>
                        {cli.nome} - {formatWhatsApp(cli.whatsapp)}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setIsQuickCustomerOpen(true)}
                  className="p-1.5 bg-purple-50 hover:bg-purple-100 text-[#351465] border border-purple-200 rounded-xl transition-colors shrink-0"
                  title="Cadastrar Novo Cliente (F2)"
                >
                  <UserPlus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Linha 2: Tabela de Preços / Condição */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-[#280F4D] w-32 shrink-0">
                Tab. de preços:
              </span>
              <div className="flex-1">
                <select
                  value={tabelaPreco}
                  onChange={e => setTabelaPreco(e.target.value as any)}
                  className="w-full pl-3 pr-8 py-1.5 bg-purple-50/40 border border-purple-200 rounded-xl text-xs font-medium text-slate-800 outline-hidden focus:border-[#351465] cursor-pointer"
                >
                  <option value="varejo">Varejo Padrão (Preço de Etiqueta)</option>
                  <option value="atacado">Atacado (10% de desconto)</option>
                  <option value="promocional">Promocional / Fidelidade (5% desc.)</option>
                </select>
              </div>
            </div>

            {/* Informação rápida de crediário do cliente selecionado */}
            {clienteSelecionado && (
              <div className="pt-1 border-t border-purple-50 flex items-center justify-between text-[11px] text-slate-600">
                <span className="flex items-center gap-1">
                  Crediário:{' '}
                  <strong className="text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded font-bold">
                    Liberado
                  </strong>
                </span>
                <span>
                  Débito no Carnê:{' '}
                  <strong
                    className={
                      clienteSelecionado.saldo_devedor > 0 ? 'text-amber-700 font-bold' : 'text-emerald-700 font-bold'
                    }
                  >
                    {clienteSelecionado.saldo_devedor > 0
                      ? formatCurrency(clienteSelecionado.saldo_devedor)
                      : 'Em dia (R$ 0,00)'}
                  </strong>
                </span>
              </div>
            )}
          </div>

          {/* 2. TABELA DE ITENS VENDIDOS (MEIO DIREITA) */}
          <div className="bg-white rounded-2xl border border-purple-100 shadow-xs overflow-hidden flex flex-col h-[460px]">
            {/* Cabeçalho da Tabela */}
            <div className="px-4 py-2.5 bg-purple-50/70 border-b border-purple-100 grid grid-cols-12 text-xs font-bold text-[#280F4D]">
              <span className="col-span-1">#</span>
              <span className="col-span-6">Produto</span>
              <span className="col-span-2 text-center">Qtd</span>
              <span className="col-span-3 text-right">Total</span>
            </div>

            {/* Linhas da Tabela */}
            <div className="flex-1 overflow-y-auto divide-y divide-purple-50">
              {vendaAtual.itens.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400 space-y-1.5 italic">
                  <p className="text-xs text-slate-500 font-medium">Não há nenhum produto vendido.</p>
                  <p className="text-[11px] text-slate-400 not-italic">
                    Clique nas peças na lista ao lado ou bipe para adicionar.
                  </p>
                </div>
              ) : (
                vendaAtual.itens.map((item, index) => {
                  const unitComTabela = item.preco_unitario * precoMultiplicador;
                  const totalComTabela = item.quantidade * unitComTabela;

                  return (
                    <div
                      key={item.id}
                      className="px-4 py-2.5 grid grid-cols-12 items-center text-xs hover:bg-purple-50/40 transition-colors"
                    >
                      <span className="col-span-1 font-mono text-slate-400 font-bold">
                        {String(index + 1).padStart(2, '0')}
                      </span>

                      <div className="col-span-6 min-w-0 pr-2">
                        <h5 className="font-bold text-slate-900 truncate">{item.produto_nome}</h5>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                          <span className="font-semibold text-[#280F4D]">
                            Tam: {item.tamanho}
                          </span>
                          <span>•</span>
                          <span>{item.cor}</span>
                          <span className="hidden sm:inline font-mono text-slate-400">
                            ({item.sku})
                          </span>
                        </div>
                      </div>

                      {/* Quantidade com controles */}
                      <div className="col-span-2 flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            alterarQuantidadeItemVendaAtual(item.id, item.quantidade - 1)
                          }
                          className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:bg-purple-100 hover:text-[#280F4D] transition-colors"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center font-bold text-slate-800">
                          {item.quantidade}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            alterarQuantidadeItemVendaAtual(item.id, item.quantidade + 1)
                          }
                          className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:bg-purple-100 hover:text-[#280F4D] transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Total e botão excluir */}
                      <div className="col-span-3 flex items-center justify-end gap-2 text-right">
                        <span className="font-extrabold text-[#280F4D] text-xs">
                          {formatCurrency(totalComTabela)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removerItemVendaAtual(item.id)}
                          className="text-slate-300 hover:text-rose-600 transition-colors p-1"
                          title="Remover produto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Linha Resumo Inferior do Pedido (Exatamente como o rodapé do print) */}
            <div className="p-3 bg-purple-50/60 border-t border-purple-100 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] text-slate-600">
              <div>
                <span className="block text-[10px] text-slate-400 uppercase font-medium">Pedido:</span>
                <strong className="text-slate-800 font-bold">{vendaAtual.codigo_venda}</strong>
              </div>

              <div>
                <span className="block text-[10px] text-slate-400 uppercase font-medium">
                  Total de itens:
                </span>
                <strong className="text-slate-800 font-bold">{totalPecas} un</strong>
              </div>

              <div>
                <span className="block text-[10px] text-slate-400 uppercase font-medium">
                  Itens cancelados:
                </span>
                <strong className="text-slate-800 font-bold">0</strong>
              </div>

              <div>
                <span className="block text-[10px] text-slate-400 uppercase font-medium">
                  Total desconto:
                </span>
                <strong className="text-slate-800 font-bold">
                  {formatCurrency(
                    (tabelaPreco !== 'varejo' ? vendaAtual.subtotal - subtotalBase : 0) + valorDescontoManual
                  )}
                  {descontoPercentual > 0 && ` (${descontoPercentual}%)`}
                </strong>
              </div>

              <div>
                <span className="block text-[10px] text-slate-400 uppercase font-medium">
                  Total acréscimo:
                </span>
                <strong className="text-slate-800 font-bold">R$ 0,00</strong>
              </div>
            </div>
          </div>

          {/* 3. BOTÃO FINALIZAR (F5) + VALOR TOTAL GIGANTE (BOTTOM DIREITA) */}
          <div className="bg-white rounded-2xl border border-purple-100 shadow-xs p-3.5 flex items-center justify-between gap-4">
            <button
              type="button"
              disabled={vendaAtual.itens.length === 0}
              onClick={() => setIsCheckoutOpen(true)}
              className="px-8 py-3.5 bg-gradient-to-r from-[#280F4D] via-[#351465] to-[#481B84] hover:opacity-95 disabled:opacity-40 disabled:pointer-events-none text-white rounded-2xl text-base font-black shadow-md shadow-purple-950/20 flex items-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
            >
              <span>Finalizar (F5)</span>
              <ArrowRight className="w-5 h-5" />
            </button>

            {/* Total Gigante em Destaque */}
            <div className="text-right">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Total a Pagar
              </span>
              <div className="text-3xl sm:text-4xl font-black text-[#280F4D] tracking-tight">
                {formatCurrency(subtotalExibicao)}
              </div>
              {valorDescontoManual > 0 && (
                <span className="text-[11px] text-emerald-700 font-bold block">
                  Desconto: -{formatCurrency(valorDescontoManual)}{' '}
                  {descontoPercentual > 0 && `(${descontoPercentual}%)`}
                </span>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* MODAL DE OBSERVAÇÕES (F12) */}
      {isObsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 border border-purple-100 animate-in fade-in zoom-in-95 space-y-4">
            <div className="flex items-center justify-between border-b border-purple-100 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#351465]" />
                <h3 className="font-bold text-sm text-[#280F4D]">Observações da Venda</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsObsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <textarea
              rows={4}
              value={observacoesVenda}
              onChange={e => setObservacoesVenda(e.target.value)}
              placeholder="Digite aqui anotações para esta venda (ex: ajuste de barra, presente, data de entrega)..."
              className="w-full p-3 bg-purple-50/30 border border-purple-200 rounded-xl text-xs text-slate-800 outline-hidden focus:border-[#351465]"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsObsModalOpen(false)}
                className="px-4 py-2 bg-[#351465] text-white rounded-xl text-xs font-bold hover:bg-[#280F4D] transition-colors"
              >
                Salvar Observação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE VENDAS EM ESPERA (AGUARDANDO - F11) */}
      {isAguardandoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-5 border border-purple-100 animate-in fade-in zoom-in-95 space-y-4">
            <div className="flex items-center justify-between border-b border-purple-100 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#351465]" />
                <h3 className="font-bold text-sm text-[#280F4D]">Vendas em Espera (Aguardando)</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAguardandoModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-[350px] overflow-y-auto space-y-2">
              {vendasEmEspera.length === 0 ? (
                <div className="py-8 text-center text-slate-400 space-y-1">
                  <Clock className="w-8 h-8 mx-auto text-purple-200" />
                  <p className="text-xs font-bold text-slate-600">Nenhuma venda aguardando no momento.</p>
                  <p className="text-[11px] text-slate-400">
                    Use o botão "Aguardar (F7)" para pausar uma venda em andamento.
                  </p>
                </div>
              ) : (
                vendasEmEspera.map(espera => (
                  <div
                    key={espera.id}
                    className="p-3 bg-purple-50/40 border border-purple-100 rounded-xl flex items-center justify-between gap-3 hover:border-purple-300 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[#280F4D]">
                          {espera.codigo_venda}
                        </span>
                        <span className="text-[11px] text-slate-400">às {espera.criadoEm}</span>
                      </div>
                      <p className="text-xs text-slate-700 font-medium mt-0.5">
                        {espera.cliente_nome} • {espera.itens.length} {espera.itens.length === 1 ? 'item' : 'itens'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-[#280F4D]">
                        {formatCurrency(espera.subtotal)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRetomarVenda(espera)}
                        className="px-3 py-1.5 bg-[#351465] hover:bg-[#280F4D] text-white rounded-lg text-xs font-bold transition-colors"
                      >
                        Retomar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE DESCONTO (% / R$) (F9) */}
      {isDescontoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 border border-purple-100 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-purple-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-purple-100 text-[#351465] rounded-lg">
                  <Percent className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#280F4D]">Desconto na Venda</h3>
                  <p className="text-[11px] text-slate-500">Escolha a porcentagem (%) ou o valor em reais (R$)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDescontoModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Informações da Venda */}
            <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-200 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-500 block">Subtotal dos Itens:</span>
                <strong className="text-slate-900 font-bold text-sm">{formatCurrency(subtotalBase)}</strong>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block">Total com Desconto:</span>
                <strong className="text-[#280F4D] font-black text-sm">{formatCurrency(subtotalExibicao)}</strong>
              </div>
            </div>

            {/* Atalhos Rápidos de Porcentagem */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Descontos Rápidos em Porcentagem
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[5, 10, 15, 20, 30, 50].map(pct => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => {
                      setDescontoPercentual(pct);
                      const valor = Math.round(((subtotalBase * pct) / 100) * 100) / 100;
                      setDescontoValorManual(valor);
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-between border ${
                      Math.abs(descontoPercentual - pct) < 0.1
                        ? 'bg-[#280F4D] text-white border-[#280F4D] shadow-xs'
                        : 'bg-white hover:bg-purple-50 text-slate-800 border-purple-200'
                    }`}
                  >
                    <span>{pct}%</span>
                    <span className="text-[10px] opacity-80">
                      -{formatCurrency((subtotalBase * pct) / 100)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Campos Manuais de % e R$ */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Porcentagem (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={descontoPercentual || ''}
                    onChange={e => {
                      const pct = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                      setDescontoPercentual(pct);
                      const valor = Math.round(((subtotalBase * pct) / 100) * 100) / 100;
                      setDescontoValorManual(valor);
                    }}
                    placeholder="0"
                    className="w-full pl-3 pr-7 py-2 bg-purple-50/20 border border-purple-300 rounded-xl text-sm font-bold text-purple-900 outline-hidden focus:ring-2 focus:ring-purple-400"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    %
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Valor em Reais (R$)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max={subtotalBase}
                    step="1"
                    value={descontoValorManual || ''}
                    onChange={e => {
                      const val = Math.max(0, Math.min(subtotalBase, parseFloat(e.target.value) || 0));
                      setDescontoValorManual(val);
                      const pct = subtotalBase > 0 ? Math.round(((val / subtotalBase) * 100) * 10) / 10 : 0;
                      setDescontoPercentual(pct);
                    }}
                    placeholder="0,00"
                    className="w-full pl-7 pr-3 py-2 bg-purple-50/20 border border-purple-300 rounded-xl text-sm font-bold text-purple-900 outline-hidden focus:ring-2 focus:ring-purple-400"
                  />
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    R$
                  </span>
                </div>
              </div>
            </div>

            {/* Ações */}
            <div className="flex items-center justify-between pt-2 border-t border-purple-100">
              <button
                type="button"
                onClick={() => {
                  setDescontoPercentual(0);
                  setDescontoValorManual(0);
                  setIsDescontoModalOpen(false);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              >
                Limpar Desconto
              </button>

              <button
                type="button"
                onClick={() => setIsDescontoModalOpen(false)}
                className="px-5 py-2 bg-gradient-to-r from-[#280F4D] to-[#351465] text-white rounded-xl text-xs font-bold hover:opacity-95 transition-colors cursor-pointer shadow-xs"
              >
                Aplicar na Venda
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Customer Modal (F2) */}
      <QuickCustomerModal
        isOpen={isQuickCustomerOpen}
        onClose={() => setIsQuickCustomerOpen(false)}
        onSelectCreated={cli => vincularClienteVendaAtual(cli)}
      />

      {/* Checkout Modal (F5) */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        onSuccess={venda => {
          setVendaConcluidaParaRecibo(venda);
          setDescontoPercentual(0);
          setDescontoValorManual(0);
        }}
        cliente={clienteSelecionado}
        descontoInicial={valorDescontoManual}
        descontoPctInicial={descontoPercentual}
      />

      {/* Printable Receipt Modal */}
      <ReceiptModal
        venda={vendaConcluidaParaRecibo}
        onClose={() => setVendaConcluidaParaRecibo(null)}
      />
    </div>
  );
};
