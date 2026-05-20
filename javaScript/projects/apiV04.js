export async function buscarLotesPaginados(urlBase, idEmpreendimento) {
    
    // 1. Busca APENAS a primeira página para descobrir o total
    const params = new URLSearchParams({ empreendimentoID: idEmpreendimento, pagina: "1" });
    const res = await fetch(`${urlBase}?${params.toString()}`);
    const data = await res.json();
    const respostaBubble = data.response || data;
    
    let todosLotes = respostaBubble.lotes || [];
    
    // O BUBBLE PRECISA DEVOLVER ESSA VARIÁVEL:
    const totalPaginas = respostaBubble.total_paginas || 1; 


    // 2. Se tiver mais páginas, dispara TODAS de uma vez simultaneamente!
    if (totalPaginas > 1) {
        const promessasRestantes = [];
        for (let i = 2; i <= totalPaginas; i++) {
            const paramsPagina = new URLSearchParams({ empreendimentoID: idEmpreendimento, pagina: i.toString() });
            const urlPagina = `${urlBase}?${paramsPagina.toString()}`;
            
            // Dispara a requisição e já converte pra JSON
            promessasRestantes.push(fetch(urlPagina).then(r => r.json()));
        }
        
        // Espera todas as páginas chegarem juntas
        const respostas = await Promise.all(promessasRestantes);
        
        respostas.forEach(d => {
            const resBubble = d.response || d;
            if (resBubble.lotes) {
                todosLotes = todosLotes.concat(resBubble.lotes);
            }
        });
    }
    
    return todosLotes;
}