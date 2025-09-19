// processingV14.js
function gerarMatrizConsolidada(matrizesPorConta, contasSelecionadas, anosFiltrados, modo) {
    const matrizDRE = {};
    const matrizDepartamentos = {};
    const mesesExistentes = new Set();

    matrizesPorConta.forEach((dadosConta, codConta) => {
        if (!contasSelecionadas.includes(codConta)) return;

        Object.values(dadosConta.matrizDRE).forEach(classeData => {
            Object.keys(classeData).forEach(mesAno => {
                const [mes, ano] = mesAno.split('-');
                if (anosFiltrados.includes(ano)) mesesExistentes.add(mesAno);
            });
        });

        Object.entries(dadosConta.matrizDRE).forEach(([classe, mesesData]) => {
            if (!matrizDRE[classe]) matrizDRE[classe] = {};
            Object.entries(mesesData).forEach(([mesAno, valor]) => {
                const [mes, ano] = mesAno.split('-');
                if (anosFiltrados.includes(ano)) {
                    matrizDRE[classe][mesAno] = (matrizDRE[classe][mesAno] || 0) + valor;
                }
            });
        });

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

                Object.entries(catData.valores).forEach(([mesAno, valor]) => {
                    const [mes, ano] = mesAno.split('-');
                    if (anosFiltrados.includes(ano)) catRef.valores[mesAno] = (catRef.valores[mesAno] || 0) + valor;
                });

                catData.fornecedores.forEach(fornecedorData => {
                    const nomeForn = fornecedorData.fornecedor;
                    if (!catRef.fornecedores[nomeForn]) catRef.fornecedores[nomeForn] = { fornecedor: nomeForn, total: 0, valores: {} };
                    const fornRef = catRef.fornecedores[nomeForn];

                    Object.entries(fornecedorData.valores || {}).forEach(([mesAno, valor]) => {
                        const [mes, ano] = mesAno.split('-');
                        if (anosFiltrados.includes(ano)) {
                            fornRef.valores[mesAno] = (fornRef.valores[mesAno] || 0) + valor;
                            fornRef.total += valor;
                        }
                    });
                });
            });
        });
    });

    let colunas = Array.from(mesesExistentes).sort();
    if (modo.toLowerCase() === 'anual') {
        colunas = Array.from(new Set(colunas.map(m => m.split('-')[1]))).sort();
    }

    return { matrizDRE, matrizDepartamentos, colunas };
}

export { gerarMatrizConsolidada };
