# 📺 Aquanet TV - Frutiger Aero IPTV Player (React Native Android)

Uma recriação fiel e nostálgica da interface OSD (On-Screen Display) e EPG (Guia de Programação Eletrônico) de receptores de TV por satélite/cabo do final dos anos 2000 (DirecTV, Dish Network, SKY 2007-2009), **convertido para React Native Nativo para Android**, operando exclusivamente em **Modo Paisagem (Landscape)**.

---

## ✨ Novidades da Versão Android Nativa

1. **Eliminação Completa da API Backend**:
   - O aplicativo roda **100% nativo e client-side no Android**.
   - Não depende mais de servidor local Node.js na porta 1414.

2. **Player IPTV Genérico Multi-Provedores (Tela de Login)**:
   - Ao iniciar o aplicativo pela primeira vez, uma tela de boas-vindas skeuomórfica Frutiger Aero permite conectar a qualquer provedor IPTV do mercado:
     - 🛰️ **XTREAM CODES**: Host/Servidor, Usuário e Senha.
     - 📺 **EZHOMETECH API**: Portal/Servidor, Usuário/ID e Senha/Token.
     - ⚡ **FASTOCLOUD**: Host, Usuário/Token e Senha.
     - 🔗 **LISTA M3U / M3U8 URL**: URL direta da lista sem necessidade de conta, com suporte opcional a guia XMLTV EPG.
     - 🧪 **CANAIS DEMO**: Botão de acesso instantâneo a canais públicos abertos e de teste para usar sem nenhuma credencial.
   - Credenciais e configurações são salvas localmente no dispositivo para reconexão automática.

3. **Controle Remoto REAL (Android TV & D-Pad)**:
   - O controle remoto virtual na tela foi **eliminado**, liberando 100% da área útil do display da TV.
   - Suporte nativo completo a **controles remotos físicos reais** (Android TV, TV Box, teclados sem fio, Fire TV Stick):
     - **D-Pad (▲ / ▼ / ◀ / ▶)**: Navegação de canais, volume e menus.
     - **OK / SELECT / ENTER**: Sintoniza canais, confirma diálogos ou aciona Play/Pause.
     - **VOL + / VOL - / MUTE**: Controle de volume real com OSD em barra Frutiger Aero.
     - **CH + / CH -**: Troca sequencial de canais.
     - **0 a 9 (Teclado Numérico)**: Discagem direta de canais (ex: 1, 2, 0).
     - **Botões Coloridos (Vermelho, Verde, Amarelo, Azul)**:
       - 🔴 **Vermelho**: Pág ▲ (-4 canais no Guia) / Mutar SFX.
       - 🟢 **Verde**: Pág ▼ (+4 canais no Guia) / Alternar Tubo CRT Scanlines.
       - 🟡 **Amarelo**: Sintonizar URL/Vídeo / Trocar Provedor IPTV.
       - 🔵 **Azul**: Abrir/Fechar Mini Guia Lateral / Fechar Guia.
     - **INFO**: Exibe/Oculta o Banner Superior OSD.
     - **GUIDE**: Abre o Guia EPG Completo com PIP.
     - **BACK / ESC**: Fecha menus ou banners e retorna à transmissão.

4. **Gestos na Tela Touch (Touchscreen Mobile em Modo Paisagem)**:
   - **Deslizar verticalmente no lado ESQUERDO da tela**: Ajusta o volume com a barra gráfica OSD.
   - **Deslizar verticalmente no lado DIREITO da tela**: Troca de canal (ou navega no Guia / Mini Guia).
   - **Deslizar horizontalmente (◀ / ▶)**: Troca de canal ou folheia informações no Banner OSD.
   - **Puxar da borda esquerda para o centro**: Abre instantaneamente o **Mini Guia Lateral**.
   - **Toque simples (Tap)**: Abre ou oculta o Banner de Informações.
   - **Toque duplo (Double Tap)**: Liga/desliga o efeito nostálgico de Tubo CRT (Scanlines e fósforo).

5. **Fidelidade Visual 100% Preservada**:
   - Mantida integralmente toda a estética de vidro glossy, reflexos especulares, gradientes skeuomórficos, relógio analógico funcional, gerador procedimental de ruído de chiado de TV analógica ("Sem Sinal 771") a 60 FPS e síntese sonora Web Audio.

---

## 🚀 Como Executar no Android

### Pré-requisitos
- Node.js (v18+)
- Dispositivo Android (celular, tablet ou Android TV) conectado via USB com depuração ativada, ou emulador Android Studio, ou o aplicativo [Expo Go](https://expo.dev/go).

### Instalação de Dependências
```bash
npm install
```

### Inicialização Rápida
```bash
# Inicia o bundler do projeto
npm start
```

Ou execute o script em lote no Windows:
```bash
start-all.bat
```

### Execução no Dispositivo / Emulador Android
```bash
npm run android
```

---

## 📂 Estrutura do Projeto

- `App.js`: Componente raiz React Native com bloqueio de orientação paisagem, modo imersivo e ponte de eventos de controle remoto real.
- `app.json`: Configurações nativas do Expo e Android (orientação landscape, suporte TV).
- `bundledHtml.js`: Pacote autocontido com o player e assets Frutiger Aero.
- `bundle-web.js`: Script utilitário para compilar e atualizar os assets do player.
- `web/`: Código-fonte do frontend (HTML, CSS Frutiger Aero, sintetizadores de áudio e clientes IPTV).
  - `web/channels.js`: Clientes Xtream Codes, EzhomeTech, FastoCloud, M3U Parser e gerenciador de credenciais.
  - `web/app.js`: Controlador do player, navegação, gestos touch e EPG.
  - `web/style.css`: Estilização completa Frutiger Aero 2000s skeuomórfica.
