function loadMainModule(url, callback = null) {
  // Impede o carregamento duplicado do mesmo script
  if (document.querySelector(`script[src="${url}"]`)) {
    console.log(`Módulo de ${url} já foi iniciado.`);
    callback?.(); // executa se callback existir
    return;
  }

  const script = document.createElement('script');
  script.type = 'module';
  script.src = url;

  script.onload = () => {
    console.log(`Módulo ${url} carregado com sucesso.`);
    callback?.();
  };

  script.onerror = () => {
    console.error(`Falha grave ao carregar o módulo de ${url}.`);
  };

  document.head.appendChild(script);
}