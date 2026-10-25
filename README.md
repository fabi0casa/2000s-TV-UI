# 📺 Frutiger Aero IPTV - UI de TV dos Anos 2000s

Uma recriação fiel e nostálgica da interface OSD (On-Screen Display) e EPG (Guia de Programação Eletrônico) de receptores de TV por satélite/cabo do final dos anos 2000 (DirecTV, Dish Network, SKY 2007-2009).

Desenvolvido em **HTML5, CSS3 puro e JavaScript vanilla**, totalmente responsivo para funcionar tanto em computadores (Desktop) quanto em celulares (Mobile/Touch).

---

## ✨ Recursos Principais

1. **Estética Frutiger Aero & Skeuomorphism Total**:
   - Degradês translúcidos com brilho especular em arco (*glossy glass*).
   - Botões esféricos 3D com destaque radial (Vermelho, Verde, Amarelo, Azul).
   - Ícones skeuomórficos 3D em SVG: Globo terrestre com reflexo, relógio analógico com aro de prata que marca a hora real, e engrenagem cromada.
   - Tipografia autêntica dos receptores da época (*Titillium Web / Segoe UI / OSD monospace*).
   - Camada opcional de fósforo e linhas de varredura (*CRT Scanlines & Bloom*).

2. **Banner Informativo Superior (OSD Mini Banner)**:
   - Inspirado diretamente na interface clássica:
     - Linha 1: Logotipo da emissora, número do canal (ex: `001`), sigla (`ARP-TV`), título do programa em exibição e faixa de áudio.
     - Linha 2: Barra metálica com data/hora em tempo real, intervalo de exibição, classificação indicativa (`TV-PG`, etc.) e ícones 3D.
     - Linha 3: Barra inferior com favoritos e atalhos coloridos do controle remoto.
   - **Navegação de canais no Banner (estilo decodificador real)**:
     - Ao abrir o banner com **OK** ou **INFO**, pressione as setas **◀ / ▶ (Esquerda / Direita)** para folhear as informações dos outros canais em ordem sem trocar a transmissão atual.
     - Se o tempo do banner expirar, nada acontece e o canal atual é mantido.
     - Se pressionar **OK** enquanto navega nas informações de outro canal, a TV sintoniza imediatamente no canal selecionado!
   - Desliza suavemente na troca de canais e desaparece automaticamente após alguns segundos.

3. **Guia de Programação Completo (Full Screen EPG)**:
   - Inspirado no clássico menu do *DirecTV / ARPWIRE TV CHOICE 2009*:
     - Janela **Picture-In-Picture (PIP)** no canto superior direito reproduzindo o canal ao vivo em miniatura.
     - Cabeçalho com marca d'água translúcida `guide` e logotipo em relevo 3D.
     - Caixa de sinopse detalhada do programa ou aviso de sinal da antena.
     - Grade de horários com cursor de seleção dourado/âmbar em alto relevo com brilho.
     - Navegação completa por canais e horários.

4. **Mini Guia Lateral (Mini Guide)**:
   - Acessível pelo botão azul do controle ou tecla `M`, permitindo navegar e sintonizar outros canais sem interromper a transmissão.

5. **Tela de Chiado / Sem Sinal ("No Signal" 60 FPS com Áudio Real)**:
   - Sintetizador procedimental de ruído analógico de TV (*snow static noise*) via Canvas 2D a 60 FPS.
   - Caixa flutuante clássica em 3D:
     > *"📡 SEM SINAL DO SATÉLITE (771) - Buscando sinal no transponder..."*
   - Gerador de som de estática e zumbido analógico sintetizado em tempo real via **Web Audio API** (sem arquivos de áudio externos!).

6. **Controle Remoto Nostálgico Interativo (Controle 2000s)**:
   - Modelo skeuomórfico completo com acabamento emborrachado e metal escovado:
     - Botão Power com LED vermelho/verde.
     - D-Pad direcional (Cima, Baixo, Esquerda, Direita, Select/OK).
     - Teclado numérico de 0 a 9 para discagem direta de canal (ex: digitar 2, 9, 5).
     - Teclas de volume e troca de canal (+ / -).
     - 4 botões coloridos de atalho (Vermelho, Verde, Amarelo, Azul).
     - Pode ser arrastado pelo cabeçalho no PC ou minimizado para um botão flutuante.
     - No celular (modo retrato), acomoda-se automaticamente logo abaixo da tela da TV.

7. **Suporte a Streams e Vídeos Personalizados**:
   - Pressione o botão Amarelo (*TV Options*) para abrir o modal e inserir URLs de vídeos (.mp4, .webm) ou transmissões IPTV ao vivo.

---

## 🎮 Controles e Atalhos de Teclado

| Tecla | Ação |
| :--- | :--- |
| **▲ / ▼ (Setas Cima / Baixo)** | Ajustar Volume (ou navegar pelas linhas do Guia e Mini Guia) |
| **◀ / ▶ (Setas Esquerda / Direita)** | Trocar de canal / Navegar canais na barra Info (ou navegar horários no Guia) |
| **Enter / OK** | Sintonizar canal pré-visualizado no Banner / Abrir ou fechar Info |
| **G** | Abrir / Fechar Guia Completo (EPG) |
| **I** | Exibir / Ocultar Banner de Informações (INFO) |
| **M** | Abrir / Fechar Mini Guia Lateral |
| **C** | Ligar / Desligar Efeito de Tubo CRT (Scanlines) |
| **X** | Alternar instantaneamente para canal de Chiado (Sem Sinal) |
| **0 a 9** | Digitar número do canal diretamente |
| **Esc** | Fechar guias e menus abertos |

---

## 📱 Suporte a Telas Touch / Celular
- Deslizar o dedo para **cima/baixo** na tela da TV: Altera o volume (ou navega no Guia).
- Deslizar o dedo para os **lados**: Troca de canal (ou navega no Banner de Informações e horários do Guia).
- Toque rápido na tela da TV: Abre/fecha o banner de informações.
- Uso interativo através do controle remoto virtual integrado.

---

## 🚀 Como Executar
1. Basta abrir o arquivo `index.html` em qualquer navegador web moderno (Google Chrome, Microsoft Edge, Firefox, Safari ou navegadores mobile).
2. Não requer instalação de dependências ou servidores locais, pois todo o código e efeitos de áudio são autossuficientes e nativos da Web!
