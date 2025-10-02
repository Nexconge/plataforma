function loadMainModule(url, callback) {
  // Impede o carregamento duplicado do mesmo script
  if (document.querySelector(`script[src="${url}"]`)) {
    console.log(`Módulo de ${url} já foi iniciado.`);
    if (callback) callback(); // Se já existe, executa o callback imediatamente.
    return;
  }

  const script = document.createElement('script');
  script.type = 'module';
  script.src = url;

  // Evento disparado quando o script é carregado e executado com sucesso
  script.onload = function() {
    console.log(`Módulo ${url} carregado com sucesso.`);
    if (callback) callback(); // Executa o callback
  };

  // Evento para tratar falhas no carregamento
  script.onerror = function() {
    console.error(`Falha grave ao carregar o módulo de ${url}.`);
  };

  document.head.appendChild(script);
}