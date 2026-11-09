import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Printer,
  Tag,
  CheckSquare,
  Square,
  Sparkles,
  Sliders,
  FileSpreadsheet,
  Download,
  Loader2,
  Search,
  Package,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { Produto, ProdutoGrade } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { renderBarcodeToSvg, getBarcodeDataUrl } from '../../utils/barcode';
import { gerarPdfEtiquetas, formatarTextoEtiqueta } from '../../utils/labelPdf';

interface EtiquetasModalProps {
  isOpen: boolean;
  onClose: () => void;
  produtos?: Produto[];
  produtoInicial?: Produto | null;
  produtoPreSelecionado?: Produto | null;
}

interface ItemEtiqueta {
  produtoNome: string;
  referencia: string;
  categoria: string;
  precoVenda: number;
  grade: ProdutoGrade;
  copias: number;
  selecionado: boolean;
}

export type ModeloEtiquetaId =
  | 'a4_6187'
  | 'a4_a4349'
  | 'a4_a4351'
  | 'a4_ebf23'
  | 'a5_a5q1250'
  | 'termica_50x30'
  | 'termica_80x40';

interface ModeloConfig {
  id: ModeloEtiquetaId;
  label: string;
  tipo: 'folha_a4' | 'folha_a5' | 'termica';
  colunas: number;
  etiquetasPorFolha: number;
  larguraMm: number;
  alturaMm: number;
  gapXMm?: number;
  gapYMm?: number;
  margemSuperiorMm?: number;
  margemEsquerdaMm?: number;
  descricao: string;
}

const MODELOS_CONFIG: ModeloConfig[] = [
  {
    id: 'a4_6187',
    label: 'A4 - Pimaco/Maxprint | Cód.: 6187 | 80 etiquetas por folha',
    tipo: 'folha_a4',
    colunas: 4,
    etiquetasPorFolha: 80,
    larguraMm: 48.2,
    alturaMm: 12.7,
    descricao: '4 colunas × 20 linhas (48,2mm × 12,7mm) em folha A4 comum',
  },
  {
    id: 'a4_a4349',
    label: 'A4 - Pimaco | Cód.: A4349 | 126 etiquetas por folha',
    tipo: 'folha_a4',
    colunas: 7,
    etiquetasPorFolha: 126,
    larguraMm: 25.4,
    alturaMm: 12.7,
    descricao: '7 colunas × 18 linhas (25,4mm × 12,7mm) mini em folha A4',
  },
  {
    id: 'a4_a4351',
    label: 'A4 - Pimaco | Cód.: A4351 | 65 etiquetas por folha',
    tipo: 'folha_a4',
    colunas: 5,
    etiquetasPorFolha: 65,
    larguraMm: 38.1,
    alturaMm: 21.2,
    gapXMm: 2.5,
    gapYMm: 0.0,
    margemSuperiorMm: 10.70,
    margemEsquerdaMm: 5.50,
    descricao: '5 colunas × 13 linhas (38,1mm × 21,2mm) — Medidas exatas do PDF oficial',
  },
  {
    id: 'a4_ebf23',
    label: 'A4 - Singularis | Cód.: EBF23 (Etiqueta Anel) | 40 etiquetas por folha',
    tipo: 'folha_a4',
    colunas: 4,
    etiquetasPorFolha: 40,
    larguraMm: 48.2,
    alturaMm: 25.4,
    descricao: '4 colunas × 10 linhas para acessórios, bijuterias ou alças finas',
  },
  {
    id: 'a5_a5q1250',
    label: 'A5 - [DESCONTINUADO] Pimaco | A5Q-1250 | 27 etiquetas por folha',
    tipo: 'folha_a5',
    colunas: 3,
    etiquetasPorFolha: 27,
    larguraMm: 44.4,
    alturaMm: 18.0,
    descricao: '3 colunas × 9 linhas (44,4mm × 18,0mm) em folha A5',
  },
  {
    id: 'termica_50x30',
    label: 'Rolo Térmico - 50x30 mm | 1 coluna (Zebra / Argox / Elgin)',
    tipo: 'termica',
    colunas: 1,
    etiquetasPorFolha: 1,
    larguraMm: 50,
    alturaMm: 30,
    descricao: 'Etiqueta contínua em bobina térmica padrão de vestuário',
  },
  {
    id: 'termica_80x40',
    label: 'Rolo Térmico - 80x40 mm | Grande com Descrição Completa',
    tipo: 'termica',
    colunas: 1,
    etiquetasPorFolha: 1,
    larguraMm: 80,
    alturaMm: 40,
    descricao: 'Etiqueta térmica grande para gôndolas e tags de roupas',
  },
];

export const EtiquetasModal: React.FC<EtiquetasModalProps> = ({
  isOpen,
  onClose,
  produtos: produtosProps,
  produtoInicial,
  produtoPreSelecionado,
}) => {
  const store = useStore();
  const produtos = produtosProps || store.produtos;
  const prodFiltro = produtoPreSelecionado || produtoInicial;

  // Modelo selecionado (padrão igual ao print: A4351 ou 6187)
  const [modeloSelecionado, setModeloSelecionado] = useState<ModeloEtiquetaId>('a4_a4351');
  const [itensParaEtiqueta, setItensParaEtiqueta] = useState<ItemEtiqueta[]>([]);
  const [busca, setBusca] = useState('');
  const [exibirNomeLoja, setExibirNomeLoja] = useState<boolean>(true);
  const [posicaoInicial, setPosicaoInicial] = useState<number>(1); // para folhas A4 com etiquetas já usadas
  const [gerandoPdf, setGerandoPdf] = useState(false);

  const configAtual =
    MODELOS_CONFIG.find(m => m.id === modeloSelecionado) || MODELOS_CONFIG[2];

  useEffect(() => {
    if (!isOpen) return;

    const list: ItemEtiqueta[] = [];
    const sourceProds = prodFiltro ? [prodFiltro] : produtos;

    sourceProds.forEach(p => {
      p.grades.forEach(g => {
        list.push({
          produtoNome: p.nome,
          referencia: p.referencia || 'REF',
          categoria: p.categoria || 'Vestuário',
          precoVenda: p.preco_venda,
          grade: g,
          copias: Math.max(1, Math.min(g.estoque_disponivel || 2, 4)), // sugere cópias com base no estoque
          selecionado: true,
        });
      });
    });

    setItensParaEtiqueta(list);
    setBusca('');
  }, [isOpen, prodFiltro, produtos]);

  if (!isOpen) return null;

  const toggleSelectAll = (selecionar: boolean) => {
    setItensParaEtiqueta(prev => prev.map(item => ({ ...item, selecionado: selecionar })));
  };

  const definirUmaCopiaTodos = () => {
    setItensParaEtiqueta(prev => prev.map(item => ({ ...item, copias: 1, selecionado: true })));
  };

  const preencherConformeEstoque = () => {
    setItensParaEtiqueta(prev =>
      prev.map(item => ({
        ...item,
        copias: Math.max(1, item.grade.estoque_disponivel || 1),
        selecionado: (item.grade.estoque_disponivel || 0) > 0,
      }))
    );
  };

  const updateCopias = (index: number, delta: number) => {
    setItensParaEtiqueta(prev =>
      prev.map((item, idx) =>
        idx === index ? { ...item, copias: Math.max(1, item.copias + delta) } : item
      )
    );
  };

  const setCopiasDireto = (index: number, valor: number) => {
    setItensParaEtiqueta(prev =>
      prev.map((item, idx) =>
        idx === index ? { ...item, copias: Math.max(1, Math.min(999, valor || 1)) } : item
      )
    );
  };

  const toggleItem = (index: number) => {
    setItensParaEtiqueta(prev =>
      prev.map((item, idx) => (idx === index ? { ...item, selecionado: !item.selecionado } : item))
    );
  };

  const termo = busca.trim().toLowerCase();
  const itensExibidosComIndice = itensParaEtiqueta
    .map((item, originalIndex) => ({ item, originalIndex }))
    .filter(({ item }) => {
      if (!termo) return true;
      return (
        item.produtoNome.toLowerCase().includes(termo) ||
        item.referencia.toLowerCase().includes(termo) ||
        item.categoria.toLowerCase().includes(termo) ||
        item.grade.tamanho.toLowerCase().includes(termo) ||
        item.grade.cor.toLowerCase().includes(termo) ||
        item.grade.sku.toLowerCase().includes(termo) ||
        item.grade.codigo_barras.includes(termo)
      );
    });

  const itensSelecionados = itensParaEtiqueta.filter(i => i.selecionado);
  const totalEtiquetasAImprimir = itensSelecionados.reduce((acc, curr) => acc + curr.copias, 0);

  // Lista expandida de todas as etiquetas a imprimir (repetindo por número de cópias)
  const listaEtiquetasExpandida: ItemEtiqueta[] = [];
  itensSelecionados.forEach(item => {
    for (let c = 0; c < item.copias; c++) {
      listaEtiquetasExpandida.push(item);
    }
  });

  // Espaços vazios antes da primeira etiqueta se o usuário estiver aproveitando uma folha iniciada
  const espacosVaziosInicio = Math.max(0, posicaoInicial - 1);

  // Baixa o arquivo PDF da folha com as etiquetas configuradas
  const baixarPdfFolha = async () => {
    if (itensSelecionados.length === 0) return;
    setGerandoPdf(true);
    try {
      const pdf = await gerarPdfEtiquetas(
        itensParaEtiqueta,
        configAtual,
        posicaoInicial,
        exibirNomeLoja
      );
      const dataHoje = new Date().toISOString().split('T')[0];
      pdf.save(`folha-etiquetas-${configAtual.id}-${dataHoje}.pdf`);
    } catch (err) {
      console.error('Erro ao gerar PDF da folha de etiquetas:', err);
    } finally {
      setGerandoPdf(false);
    }
  };

  // Ao apertar em imprimir, baixa o PDF da folha e abre o diálogo de impressão
  const handlePrint = async () => {
    await baixarPdfFolha();
    setTimeout(() => {
      window.print();
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full overflow-hidden border border-purple-100 my-4 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#280F4D] via-[#351465] to-[#481B84] px-6 py-4 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 text-white rounded-xl backdrop-blur-xs">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                Emissão &amp; Impressão de Etiquetas com Código de Barras
              </h3>
              <p className="text-xs text-purple-200">
                Modelos Pimaco / Maxprint A4/A5 e Bobinas Térmicas com Código de Referência
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* Seletor de Modelo de Etiqueta (Igual ao print do usuário) */}
          <div className="bg-purple-50/50 p-4 rounded-2xl border border-purple-100 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                Selecione o modelo da etiqueta...
              </label>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-600 font-semibold flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exibirNomeLoja}
                    onChange={e => setExibirNomeLoja(e.target.checked)}
                    className="w-3.5 h-3.5 text-purple-600 rounded"
                  />
                  <span>Exibir Nome da Loja</span>
                </label>
              </div>
            </div>

            {/* Dropdown idêntico ao print */}
            <select
              value={modeloSelecionado}
              onChange={e => {
                setModeloSelecionado(e.target.value as ModeloEtiquetaId);
                setPosicaoInicial(1);
              }}
              className="w-full px-3.5 py-2.5 bg-white border-2 border-purple-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 outline-hidden focus:border-[#351465] cursor-pointer shadow-2xs"
            >
              {MODELOS_CONFIG.map(m => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>

            <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 pt-1 gap-2">
              <span className="font-medium text-purple-900 bg-purple-100/60 px-2 py-0.5 rounded">
                Formato: <strong>{configAtual.descricao}</strong>
              </span>

              {configAtual.tipo !== 'termica' && (
                <div className="flex items-center gap-1.5 bg-white/80 p-1.5 rounded-xl border border-purple-200">
                  <button
                    type="button"
                    onClick={() => setPosicaoInicial(prev => Math.min(configAtual.etiquetasPorFolha, prev + 1))}
                    className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-[#351465] border border-purple-200 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs"
                    title="Pular espaço na folha para reaproveitar papel"
                  >
                    Etiqueta Vazia {posicaoInicial > 1 && `(${posicaoInicial - 1} vazias)`}
                  </button>

                  {posicaoInicial > 1 && (
                    <button
                      type="button"
                      onClick={() => setPosicaoInicial(1)}
                      className="px-2 py-1 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                      title="Zerar etiquetas vazias"
                    >
                      Limpar
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Lista de Peças e Quantidade de Cópias com Pesquisa Estilo PDV */}
          <div className="space-y-3">
            {/* Barra de Pesquisa Rápida e Ações */}
            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-purple-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Pesquisar por modelo, referência, tamanho ou cód. barras..."
                  className="w-full pl-9 pr-8 py-2 bg-purple-50/40 border border-purple-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-[#351465] focus:bg-white transition-all shadow-2xs"
                />
                {busca && (
                  <button
                    type="button"
                    onClick={() => setBusca('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Botões de Ações Rápidas de Quantidade */}
              <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto pb-0.5">
                <button
                  type="button"
                  onClick={preencherConformeEstoque}
                  className="px-2.5 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-900 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                  title="Ajusta o número de etiquetas de acordo com o estoque real de cada peça"
                >
                  Conforme Estoque
                </button>
                <button
                  type="button"
                  onClick={definirUmaCopiaTodos}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  title="Define 1 etiqueta para cada variação"
                >
                  1 de Cada
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pb-0.5 text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleSelectAll(true)}
                  className="text-purple-700 hover:underline font-bold cursor-pointer"
                >
                  Selecionar Todos
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => toggleSelectAll(false)}
                  className="text-slate-500 hover:underline cursor-pointer"
                >
                  Desmarcar Todos
                </button>
                {busca && (
                  <span className="text-purple-800 bg-purple-100/70 px-2 py-0.5 rounded text-[11px] font-semibold">
                    Exibindo {itensExibidosComIndice.length} de {itensParaEtiqueta.length} itens
                  </span>
                )}
              </div>

              <span className="font-bold text-slate-700">
                Total a imprimir:{' '}
                <strong className="text-purple-800 text-sm font-black">
                  {totalEtiquetasAImprimir}
                </strong>{' '}
                etiqueta(s)
                {configAtual.tipo !== 'termica' && (
                  <span className="text-slate-500 font-normal ml-1">
                    (~{Math.ceil((totalEtiquetasAImprimir + espacosVaziosInicio) / configAtual.etiquetasPorFolha)} folha(s))
                  </span>
                )}
              </span>
            </div>

            <div className="border border-purple-100 rounded-xl overflow-hidden max-h-[320px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-purple-50/70 text-slate-700 font-bold uppercase text-[10px] sticky top-0 z-10">
                  <tr>
                    <th className="p-2.5 w-10 text-center">Sel</th>
                    <th className="p-2.5">Referência</th>
                    <th className="p-2.5">Produto / Modelo</th>
                    <th className="p-2.5">Tam / Cor</th>
                    <th className="p-2.5">Código de Barras</th>
                    <th className="p-2.5">Preço</th>
                    <th className="p-2.5 text-center">Cópias</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-50">
                  {itensExibidosComIndice.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        Nenhum produto encontrado com o termo "{busca}".
                      </td>
                    </tr>
                  ) : (
                    itensExibidosComIndice.map(({ item, originalIndex }) => (
                      <tr
                        key={originalIndex}
                        className={`hover:bg-purple-50/30 transition-colors ${
                          item.selecionado ? 'bg-white' : 'bg-slate-50 opacity-50'
                        }`}
                      >
                        <td className="p-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={item.selecionado}
                            onChange={() => toggleItem(originalIndex)}
                            className="w-4 h-4 text-purple-600 rounded cursor-pointer"
                          />
                        </td>
                        <td className="p-2.5 font-mono font-bold text-purple-900">
                          {item.referencia}
                        </td>
                        <td className="p-2.5 font-bold text-slate-800">{item.produtoNome}</td>
                        <td className="p-2.5 font-semibold text-slate-600">
                          {item.grade.tamanho} / {item.grade.cor}
                        </td>
                        <td className="p-2.5 font-mono text-[11px] text-slate-700">
                          {item.grade.codigo_barras || item.grade.sku}
                        </td>
                        <td className="p-2.5 font-black text-[#280F4D]">
                          {formatCurrency(item.precoVenda)}
                        </td>
                        <td className="p-2.5 text-center">
                          <div className="inline-flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white shadow-2xs">
                            <button
                              type="button"
                              onClick={() => updateCopias(originalIndex, -1)}
                              className="px-2 py-0.5 hover:bg-slate-100 text-slate-700 font-bold"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={999}
                              value={item.copias}
                              onChange={e =>
                                setCopiasDireto(originalIndex, parseInt(e.target.value) || 1)
                              }
                              className="w-10 text-center font-bold text-xs bg-transparent border-0 outline-hidden"
                            />
                            <button
                              type="button"
                              onClick={() => updateCopias(originalIndex, 1)}
                              className="px-2 py-0.5 hover:bg-slate-100 text-slate-700 font-bold"
                            >
                              +
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pré-visualização Real da Folha / Rolo */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs px-1">
              <span className="font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span>Pré-visualização das Etiquetas com Código de Referência:</span>
              </span>
              <span className="text-[11px] text-slate-500">
                A referência <strong className="text-slate-800">Ref:</strong> sai impressa no topo de cada etiqueta
              </span>
            </div>

            <div className="p-4 bg-slate-100/70 border border-slate-200 rounded-2xl">
              {itensSelecionados.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-xs">
                  Selecione ao menos uma peça acima para pré-visualizar as etiquetas.
                </div>
              ) : (
                <div
                  className={`grid gap-2.5 ${
                    configAtual.colunas === 1
                      ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3'
                      : configAtual.colunas <= 4
                      ? 'grid-cols-2 sm:grid-cols-4'
                      : configAtual.colunas === 5
                      ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5'
                      : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-7'
                  }`}
                >
                  {/* Espaços pulados no início */}
                  {Array.from({ length: espacosVaziosInicio }).map((_, skipIdx) => (
                    <div
                      key={`skip-${skipIdx}`}
                      className="border-2 border-dashed border-slate-300 rounded-lg p-2 flex items-center justify-center text-[10px] text-slate-400 bg-white/50 min-h-[60px]"
                    >
                      Pular #{skipIdx + 1}
                    </div>
                  ))}

                  {/* Etiquetas a imprimir */}
                  {listaEtiquetasExpandida.map((item, idx) => (
                    <EtiquetaCard
                      key={`prev-${idx}`}
                      item={item}
                      modelo={configAtual}
                      exibirNomeLoja={exibirNomeLoja}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer com opções de Download em PDF e Impressão Direta */}
        <div className="bg-purple-50/40 px-5 sm:px-6 py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-purple-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-slate-600 hover:text-slate-900 text-xs font-semibold cursor-pointer order-last sm:order-first transition-colors"
          >
            Fechar
          </button>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Botão específico para apenas Baixar o Arquivo PDF da Folha */}
            <button
              type="button"
              disabled={totalEtiquetasAImprimir === 0 || gerandoPdf}
              onClick={baixarPdfFolha}
              className="px-5 py-2.5 bg-white hover:bg-purple-50 border-2 border-purple-300 text-purple-900 disabled:opacity-40 disabled:pointer-events-none rounded-xl text-xs sm:text-sm font-bold shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              title="Baixar arquivo PDF da folha para salvar no computador"
            >
              {gerandoPdf ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-purple-700" />
                  <span>Gerando PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-purple-700" />
                  <span>Baixar PDF da Folha</span>
                </>
              )}
            </button>

            {/* Botão Imprimir que automaticamente Baixa o PDF e abre o diálogo de impressão */}
            <button
              type="button"
              disabled={totalEtiquetasAImprimir === 0 || gerandoPdf}
              onClick={handlePrint}
              className="px-6 py-2.5 bg-gradient-to-r from-[#280F4D] via-[#351465] to-[#481B84] hover:opacity-95 disabled:opacity-40 disabled:pointer-events-none text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-[#280F4D]/20 flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
            >
              {gerandoPdf ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Baixando PDF...</span>
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4" />
                  <span>Imprimir &amp; Baixar PDF ({totalEtiquetasAImprimir} etiquetas)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* ÁREA DE IMPRESSÃO REAL: VISÍVEL SOMENTE NA IMPRESSÃO     */}
      {/* ======================================================== */}
      <div id="printable-labels-sheet" className="hidden print:block bg-white text-black p-0 m-0">
        <style dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page {
                size: ${
                  configAtual.tipo === 'termica'
                    ? `${configAtual.larguraMm}mm ${configAtual.alturaMm}mm`
                    : configAtual.tipo === 'folha_a5'
                    ? 'A5 portrait'
                    : 'A4 portrait'
                };
                margin: ${
                  configAtual.tipo === 'termica'
                    ? '0mm'
                    : `${configAtual.margemSuperiorMm ?? 10.7}mm ${configAtual.margemEsquerdaMm ?? 5.5}mm`
                };
              }
            }
          `
        }} />

        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${configAtual.colunas}, ${configAtual.larguraMm}mm)`,
            columnGap: `${configAtual.gapXMm ?? (configAtual.id === 'a4_a4351' ? 2.5 : 0)}mm`,
            rowGap: `${configAtual.gapYMm ?? 0}mm`,
            width: '100%',
          }}
        >
          {/* Espaços pulados no início */}
          {Array.from({ length: espacosVaziosInicio }).map((_, skipIdx) => (
            <div
              key={`print-skip-${skipIdx}`}
              style={{
                width: `${configAtual.larguraMm}mm`,
                height: `${configAtual.alturaMm}mm`,
              }}
              className="label-item-printable"
            />
          ))}

          {/* Etiquetas Impressas */}
          {listaEtiquetasExpandida.map((item, idx) => (
            <div
              key={`print-lbl-${idx}`}
              className="label-item-printable"
              style={{
                width: `${configAtual.larguraMm}mm`,
                height: `${configAtual.alturaMm}mm`,
                boxSizing: 'border-box',
                pageBreakInside: 'avoid',
                breakInside: 'avoid',
              }}
            >
              <EtiquetaCard
                item={item}
                modelo={configAtual}
                exibirNomeLoja={exibirNomeLoja}
                isPrint={true}
              />
            </div>
          ))}
        </div>

        {/* Rodapé da folha idêntico ao modelo original do PDF */}
        {configAtual.tipo !== 'termica' && (
          <div className="text-center text-[10px] text-slate-600 pt-5 font-mono tracking-wider">
            M.E.0.00 | M.S.0.00 | E.L.0.00 | E.C.0.00
          </div>
        )}
      </div>
    </div>
  );
};

// Componente da Etiqueta Individual com Nome, Tamanho, Preço e Código de Barras idêntico ao PDF
const EtiquetaCard: React.FC<{
  item: ItemEtiqueta;
  modelo: ModeloConfig;
  exibirNomeLoja: boolean;
  isPrint?: boolean;
}> = ({ item, modelo, isPrint = false }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const barcodeValue = item.grade.codigo_barras || item.grade.sku || '0000000000000';

  useEffect(() => {
    if (svgRef.current) {
      let barWidth = 1.22;
      let barHeight = 25;
      let fontSize = 9.5;

      if (modelo.id === 'a4_a4349') {
        barWidth = 0.9;
        barHeight = 14;
        fontSize = 7;
      } else if (modelo.id === 'a4_6187') {
        barWidth = 1.05;
        barHeight = 17;
        fontSize = 8;
      } else if (modelo.id === 'a4_a4351') {
        barWidth = 1.22;
        barHeight = 25;
        fontSize = 9.5;
      } else if (modelo.id === 'termica_50x30') {
        barWidth = 1.4;
        barHeight = 34;
        fontSize = 10;
      } else if (modelo.id === 'termica_80x40') {
        barWidth = 1.85;
        barHeight = 46;
        fontSize = 11;
      }

      renderBarcodeToSvg(svgRef.current, barcodeValue, {
        width: barWidth,
        height: barHeight,
        fontSize,
        displayValue: true,
        margin: 0,
      });
    }
  }, [barcodeValue, modelo.id]);

  const precoFormatado = `R$${(item.precoVenda || 0).toFixed(2).replace('.', ',')}`;

  const isMini = modelo.id === 'a4_a4349';
  const { linha1, linha2 } = formatarTextoEtiqueta(
    item.produtoNome,
    item.grade.tamanho,
    isMini ? 16 : 28,
    item.grade.cor
  );

  return (
    <div
      className={`bg-white text-black border border-slate-200 rounded p-1.5 flex flex-col justify-between overflow-hidden ${
        isPrint ? 'border-none p-0.5' : 'shadow-2xs'
      }`}
      style={{
        width: isPrint ? '100%' : undefined,
        height: isPrint ? '100%' : undefined,
        minHeight: !isPrint ? (isMini ? '70px' : '92px') : undefined,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* 1 e 2: Nome do Produto e Tamanho alinhados à esquerda exatamente como no modelo */}
      <div className="w-full text-left leading-tight px-0.5">
        <div className="text-[10px] sm:text-[10.5px] font-normal text-slate-900 truncate">
          {linha1}
        </div>
        <div className="text-[10px] sm:text-[10.5px] font-normal text-slate-900 truncate">
          {linha2}
        </div>
      </div>

      {/* 3: Preço em Negrito Destacado e Centralizado (Exato do modelo: R$263,90) */}
      <div className="w-full text-center text-[13px] sm:text-[14px] font-black text-black tracking-tight my-0.5">
        {precoFormatado}
      </div>

      {/* 4: Código de Barras EAN-13 Oficial Centralizado com Numeração */}
      <div className="flex justify-center items-center w-full overflow-hidden my-auto">
        <svg ref={svgRef} className="max-w-full" />
      </div>
    </div>
  );
};
