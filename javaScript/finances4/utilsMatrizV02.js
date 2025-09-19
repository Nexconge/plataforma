// utilsMatriz.js

function gerarMatrizConsolidada(matrizesPorConta, contasSelecionadas, anosFiltrados, modo) {
    const matrizDRE = {};
    const matrizDepartamentos = {};
    const mesesExistentes = new Set();

    matrizesPorConta.forEach((dadosConta, codConta) => {
        // Ignora contas que não estão selecionadas no filtro
        if (!contasSelecionadas.includes(codConta)) return;

        // Popula o Set de meses/anos existentes para determinar as colunas da tabela
        Object.values(dadosConta.matrizDRE).forEach(classeData => {
            Object.keys(classeData).forEach(mesAno => {
                const [mes, ano] = mesAno.split('-');
                if (anosFiltrados.includes(ano)) mesesExistentes.add(mesAno);
            });
        });

        // Consolida a matriz DRE
        Object.entries(dadosConta.matrizDRE).forEach(([classe, mesesData]) => {
            if (!matrizDRE[classe]) matrizDRE[classe] = {};
            Object.entries(mesesData).forEach(([mesAno, valor]) => {
                const [mes, ano] = mesAno.split('-');
                if (anosFiltrados.includes(ano)) {
                    matrizDRE[classe][mesAno] = (matrizDRE[classe][mesAno] || 0) + valor;
                }
            });
        });

        // Consolida a matriz de Departamentos
        Object.entries(dadosConta.matrizDepartamentos).forEach(([chaveDepto, deptoData]) => {
            const { depto, classe, categorias } = deptoData;
            const novaChave = `${depto}|${classe}`;

            if (!matrizDepartamentos[novaChave]) {
                matrizDepartamentos[novaChave] = {
                    nome: deptoData.nome || `Depto ${depto}`,
                    classe,
                    categorias: {}
                };
            }
            const deptoRef = matrizDepartamentos[novaChave];

            Object.entries(categorias).forEach(([codCategoria, catData]) => {
                if (!deptoRef.categorias[codCategoria]) {
                    deptoRef.categorias[codCategoria] = { valores: {}, fornecedores: {} };
                }
                const catRef = deptoRef.categorias[codCategoria];

                // Agrega os valores totais da categoria
                Object.entries(catData.valores).forEach(([mesAno, valor]) => {
                    const [mes, ano] = mesAno.split('-');
                    if (anosFiltrados.includes(ano)) catRef.valores[mesAno] = (catRef.valores[mesAno] || 0) + valor;
                });

                // --- CORREÇÃO NA AGREGAÇÃO DE FORNECEDORES ---
                // O 'catData.fornecedores' que vem de processarLancamentos é um ARRAY.
                // Precisamos iterar sobre ele e agregar os resultados em um OBJETO no 'catRef'.
                catData.fornecedores.forEach(fornecedorData => {
                    const nomeForn = fornecedorData.fornecedor;
                    // Garante que o fornecedor exista no objeto de agregação
                    if (!catRef.fornecedores[nomeForn]) {
                        catRef.fornecedores[nomeForn] = { fornecedor: nomeForn, total: 0, valores: {} };
                    }
                    const fornRef = catRef.fornecedores[nomeForn];

                    // Itera sobre os valores mensais do fornecedor e soma no objeto agregado
                    Object.entries(fornecedorData.valores || {}).forEach(([mesAno, valor]) => {
                        const [mes, ano] = mesAno.split('-');
                        if (anosFiltrados.includes(ano)) {
                            fornRef.valores[mesAno] = (fornRef.valores[mesAno] || 0) + valor;
                            fornRef.total += valor; // Recalcula o total consolidado
                        }
                    });
                });
            });
        });
    });

    // --- CORREÇÃO FINAL: Transforma os fornecedores agregados (objeto) em um array ordenado para a UI ---
    Object.values(matrizDepartamentos).forEach(depto => {
        Object.values(depto.categorias).forEach(cat => {
            // Converte o objeto de fornecedores de volta para um array e ordena pelo total
            cat.fornecedores = Object.values(cat.fornecedores).sort((a, b) => b.total - a.total);
        });
    });


    let colunas = Array.from(mesesExistentes).sort();
    if (modo.toLowerCase() === 'anual') {
        colunas = Array.from(new Set(colunas.map(m => m.split('-')[1]))).sort();
    }

    return { matrizDRE, matrizDepartamentos, colunas };
}

export { gerarMatrizConsolidada };
