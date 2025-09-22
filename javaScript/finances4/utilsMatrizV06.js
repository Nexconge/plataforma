function gerarMatrizConsolidada(matrizesPorConta, contasSelecionadas, anosFiltrados, modo) {
    const matrizDRE = {};
    const matrizDepartamentos = {};
    const mesesExistentes = new Set();

    matrizesPorConta.forEach((dadosConta, codConta) => {
        if (!contasSelecionadas.includes(Number(codConta))) return;

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
                    // CORREÇÃO: A propriedade 'fornecedores' na matriz consolidada deve ser um OBJETO para agregação.
                    deptoRef.categorias[codCategoria] = { valores: {}, fornecedores: {} };
                }
                const catRef = deptoRef.categorias[codCategoria];

                Object.entries(catData.valores).forEach(([mesAno, valor]) => {
                    const [mes, ano] = mesAno.split('-');
                    if (anosFiltrados.includes(ano)) catRef.valores[mesAno] = (catRef.valores[mesAno] || 0) + valor;
                });
                
                // --- LÓGICA DE AGREGAÇÃO DE FORNECEDORES CORRIGIDA ---
                // Itera no array de fornecedores da matriz de origem
                catData.fornecedores.forEach(fornecedorData => {
                    const nomeForn = fornecedorData.fornecedor;
                    
                    // Usa o nome do fornecedor como chave no OBJETO de destino para somar os valores
                    if (!catRef.fornecedores[nomeForn]) {
                        catRef.fornecedores[nomeForn] = { fornecedor: nomeForn, total: 0, valores: {} };
                    }
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

    // --- ETAPA FINAL: Converter o objeto de fornecedores de volta para um array ordenado ---
    // A UI espera um array para renderizar as linhas, então fazemos a conversão aqui.
    Object.values(matrizDepartamentos).forEach(depto => {
        Object.values(depto.categorias).forEach(cat => {
            cat.fornecedores = Object.values(cat.fornecedores).sort((a, b) => b.total - a.total);
        });
    });

    let colunas = Array.from(mesesExistentes).sort();
    
    // =======================================================================================
    // === NOVA CORREÇÃO: AGRUPAMENTO ANUAL SE NECESSÁRIO =====================================
    // =======================================================================================
    if (modo.toLowerCase() === 'anual') {
        const matrizDREAnual = {};
        const matrizDepartamentosAnual = JSON.parse(JSON.stringify(matrizDepartamentos)); // Cópia profunda

        // Agrupa DRE por ano
        for (const classe in matrizDRE) {
            matrizDREAnual[classe] = {};
            for (const mesAno in matrizDRE[classe]) {
                const ano = mesAno.split('-')[1];
                matrizDREAnual[classe][ano] = (matrizDREAnual[classe][ano] || 0) + matrizDRE[classe][mesAno];
            }
        }

        // Agrupa Departamentos por ano
        for (const deptoKey in matrizDepartamentosAnual) {
            const depto = matrizDepartamentosAnual[deptoKey];
            for (const catKey in depto.categorias) {
                const cat = depto.categorias[catKey];
                const valoresAnuais = {};
                for (const mesAno in cat.valores) {
                    const ano = mesAno.split('-')[1];
                    valoresAnuais[ano] = (valoresAnuais[ano] || 0) + cat.valores[mesAno];
                }
                cat.valores = valoresAnuais;

                cat.fornecedores.forEach(forn => {
                    const valoresAnuaisForn = {};
                    for (const mesAno in forn.valores) {
                        const ano = mesAno.split('-')[1];
                        valoresAnuaisForn[ano] = (valoresAnuaisForn[ano] || 0) + forn.valores[mesAno];
                    }
                    forn.valores = valoresAnuaisForn;
                });
            }
        }
        
        // Define as colunas como apenas os anos e retorna as matrizes anuais
        colunas = Array.from(new Set(colunas.map(m => m.split('-')[1]))).sort();
        return { matrizDRE: matrizDREAnual, matrizDepartamentos: matrizDepartamentosAnual, colunas };
    }

    return { matrizDRE, matrizDepartamentos, colunas };
}

export { gerarMatrizConsolidada };