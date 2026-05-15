export async function buscarLotesPaginados(urlBase, idEmpreendimento) {
    let pagina = 1;
    let totalPaginas = 1;
    let todosLotes = [];

    console.log(`[API Debug] Iniciando busca paginada para o empreendimento ID: ${idEmpreendimento}`);

    while (pagina <= totalPaginas) {
        try {
            const params = new URLSearchParams({ 
                empreendimentoID: idEmpreendimento, 
                pagina: pagina.toString() 
            });
            
            const url = `${urlBase}?${params.toString()}`;
            console.log(`[API Debug] GET URL: ${url}`);
            
            const response = await fetch(url);

            if (!response.ok) {
                console.error(`[API Debug] Erro HTTP na requisição: ${response.status}`);
                break;
            }

            const data = await response.json();
            const respostaBubble = data.response || data;
            
            const lotesPagina = respostaBubble.lotes || [];
            const pagAtual = respostaBubble.pagina || pagina;
            totalPaginas = respostaBubble.total_paginas || 1;

            console.log(`[API Debug] Sucesso - Página ${pagAtual} de ${totalPaginas}. Lotes na página: ${lotesPagina.length}`);

            if (lotesPagina.length > 0) {
                todosLotes = todosLotes.concat(lotesPagina);
            }

            pagina++;
        } catch (error) {
            console.error(`[API Debug] Exceção ao buscar lotes do empreendimento ${idEmpreendimento}:`, error);
            break;
        }
    }
    
    console.log(`[API Debug] Finalizado para ${idEmpreendimento}. Lotes acumulados totais: ${todosLotes.length}`);
    return todosLotes;
}