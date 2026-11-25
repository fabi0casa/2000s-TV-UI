# Aquanet TV - Frutiger Aero IPTV Player

Aplicativo Android / Android TV construído com Expo, React Native e WebView. A interface recria o visual Frutiger Aero dos receptores de TV dos anos 2000, com tela de TV, banner OSD, guia EPG, mini guia, playlists, VOD, lembretes e controle remoto configurável.

Este projeto não possui mais áudio de interface, emojis, player de vídeos externos nem entrada de streams personalizados.

## Recursos

- Provedores IPTV: Xtream Codes, EzhomeTech, FastoCloud e listas M3U/M3U8 com EPG XMLTV opcional.
- Canais de demonstração para testar o aplicativo sem credenciais.
- Até 9999 canais, com numeração de 3 ou 4 dígitos e sintonia direta pelo teclado numérico.
- Guia EPG com janela de canais (virtualização), linha do tempo de 3 horas e detalhes do programa.
- Mini guia lateral com navegação rápida.
- Favoritos persistidos e playlists por categoria do provedor, além de "Todos os Canais" e "Favoritos".
- Catálogo VOD do provedor (filmes e séries) quando a conta Xtream oferece suporte.
- Lembretes de programação com estrela no guia e popup interno no horário do programa.
- Filtro CRT desligado no primeiro uso, com estado salvo e reaplicado ao abrir o app.
- Configuração de controle remoto com teste de teclas e remapeamento.
- Persistência de conta, playlist ativa, último canal, volume, mudo, CRT, favoritos, lembretes e mapa do controle.
- Reprodução HLS com hls.js embutido no APK (funciona sem CDN).

## Controles

Fora do guia:

- Setas esquerda/direita: canal anterior/próximo (ou navegação no banner quando visível).
- Setas cima/baixo: navegação no banner; volume quando o banner está oculto.
- OK: confirma o canal exibido no banner ou abre/fecha o banner.
- INFO: abre/fecha o banner de informações.
- Vermelho: abre o catálogo de Filmes e Séries do provedor.
- Verde: liga/desliga o filtro CRT.
- Amarelo: adiciona/remove o canal atual dos favoritos.
- Azul: abre/fecha o Mini Guia.
- GUIDE/EPG: abre/fecha o guia completo.
- Play/Pause: pausa/retoma o VOD; fora do VOD alterna o banner.
- Teclas numéricas: sintonia direta (até 4 dígitos).
- Voltar: fecha o banner ou a janela atual.

Dentro do guia:

- Setas: navegação entre canais e programas.
- OK: sintoniza o canal selecionado.
- Vermelho: abre o catálogo VOD.
- Verde: agenda/remove lembrete do programa selecionado.
- Amarelo: abre o seletor de playlists.
- Azul, GUIDE ou Voltar: fecha o guia.

Dentro do VOD:

- Setas: navegação entre categorias e títulos.
- OK: abre o filme ou a série selecionada.
- Vermelho: alterna entre Filmes e Séries.
- Azul, Voltar: fecha o catálogo.

## Provedores

### Xtream Codes

Informe servidor (host ou URL), usuário e senha. O aplicativo autentica, baixa categorias, canais ao vivo, filmes, séries e EPG curto por canal.

### EzhomeTech e FastoCloud

Informe servidor, usuário e senha/token conforme o provedor. O cliente tenta os endpoints JSON usuais dessas plataformas.

### Lista M3U

Informe a URL da lista e, opcionalmente, a URL do EPG XMLTV. As categorias da lista viram playlists no guia.

## Teste com servidor Xtream falso

O repositório inclui um servidor de teste local:

```bash
npm run mock
```

Credenciais: usuário `demo`, senha `demo`.

- API: `http://localhost:8099/player_api.php`
- Lista M3U: `http://localhost:8099/playlist.m3u`
- EPG XMLTV: `http://localhost:8099/epg.xml`

Teste automatizado do servidor falso:

```bash
npm run test:xtream
```

Para testar um provedor real:

```bash
XTREAM_URL=http://host:8080 XTREAM_USER=usuario XTREAM_PASS=senha npm run test:xtream
```

## Configuração do controle remoto

Abra Configurações > Controle Remoto.

- "Testar Botões": mostra o nome e o código da tecla detectada e a ação atribuída.
- "Remapear": escolha uma ação e pressione a tecla desejada.
- "Restaurar Padrão": limpa o mapa personalizado.

O mapa é salvo localmente e aplicado imediatamente. Escape/Voltar cancela o teste ou o remapeamento.

Observação: teclas que o Android TV/WebView não entrega ao aplicativo (por exemplo, teclas exclusivas de fabricante) não podem ser capturadas sem uma ponte nativa específica. D-pad, OK, voltar e as teclas que chegam ao WebView funcionam normalmente.

## Persistência

As preferências ficam no `localStorage` da WebView, em chaves versionadas:

- `aquanet_settings_v1`
- `aquanet_favorites_v1`
- `aquanet_reminders_v1`
- `aquanet_remote_map_v1`
- `aquanet_iptv_provider_config`

## Como executar

```bash
npm install
npm run bundle:web
npm start
```

Para gerar o APK:

```bash
npm run prebuild
npm run android
```

O `bundle:web` embute HTML, CSS, JavaScript, ícones e hls.js em `bundledHtml.js`, que é carregado pela WebView sem depender de arquivos externos.

## Estrutura

- `App.js`: host React Native/WebView, ponte HTTP nativa e tratamento do botão Voltar.
- `web/index.html`: estrutura da interface.
- `web/style.css`: visual Frutiger Aero, modais, guia, VOD e configurações.
- `web/app.js`: controlador principal.
- `web/channels.js`: clientes IPTV, parser M3U/XMLTV, transformação de canais e feeds do canvas.
- `web/storage.js`: persistência local.
- `bundle-web.js`: geração de `bundledHtml.js`.
- `scripts/xtream-mock.js`: servidor Xtream de teste.
- `scripts/xtream-smoke.js`: teste automatizado.

## Limitações conhecidas

- O catálogo VOD depende do provedor oferecer as APIs Xtream de filmes e séries.
- Lembretes aparecem apenas com o aplicativo aberto; não há notificação do sistema.
- O filtro CRT e a reprodução HLS usam recursos do WebView.
- Credenciais são armazenadas localmente no dispositivo.
