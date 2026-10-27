# 📺 IPTV & EPG Curated API (com EPG Dinâmico e Stream Proxy)

API Node.js de alta performance desenvolvida para validar links de transmissão IPTV (Brasil e Estados Unidos), desduplicar canais, associar guias de programação (EPG) dinâmicos em tempo real, **contornar bloqueios de CORS no navegador via Stream Proxy** e eliminar streams geo-bloqueados ou inativos.

A API fornece seus dados através da **porta 1414** com re-verificação automática a cada **72 horas**.

---

## 🚀 Como Executar

### 1. Iniciar o Servidor
No terminal, dentro da pasta `api`:
```bash
npm start
```
ou no Windows, basta dar dois cliques no arquivo:
```
start.bat
```

O servidor iniciará em **`http://localhost:1414`**.

---

## 📡 Endpoints da API

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/` | Painel informativo de boas-vindas com status do servidor e documentação |
| `GET` | `/channels.json` | **Arquivo JSON dinâmico** com canais 100% funcionais e programação atual (`now` e `next`) calculada no exato instante da requisição |
| `GET` | `/api/channels` | Mesmo que `/channels.json`, com filtros (`?country=BR`, `?category=Esportes`, `?search=band`) |
| `GET` | `/api/channels/br` | Retorna somente os canais do **Brasil** |
| `GET` | `/api/channels/us` | Retorna somente os canais dos **Estados Unidos** |
| `GET` | `/api/epg/:channelId` | **Grade diária completa em tempo real** do canal solicitado (timeline de programas do dia) |
| `GET` | `/api/epg/live` | Retorna os programas que estão no ar agora em todos os canais simultaneamente |
| `GET` | `/live/:channelId.m3u8` | **Endpoint de stream direto e sem CORS** pronto para qualquer player web (`hls.js`, `video.js`) |
| `GET` | `/proxy?url=...` | Proxy universal reescritor de HLS/TS que injeta cabeçalhos e libera CORS |
| `GET` | `/api/status` | Status do ciclo de vida, progresso de validação e agendador |
| `POST` / `GET` | `/api/refresh` | Força uma re-verificação manual imediata das fontes |

---

## 🌐 Como Funciona o EPG Dinâmico em Tempo Real?

Anteriormente, o arquivo continha apenas um snapshot estático dos programas no momento da geração do JSON. Agora:
1. **Banco em Memória:** A API mantém toda a base de programação das fontes (*BrazilTVEPG* e *IPTV-Org EPG*) em memória.
2. **Cálculo no Momento da Requisição:** Ao chamar `GET /channels.json` ou `GET /api/channels`, a API compara o horário atual do servidor (`new Date()`) com o início e término dos programas, preenchendo os campos `now` (programa no ar agora com porcentagem de progresso) e `next` (próximo programa) em tempo real.
3. **Consulta de Grade Específica:** Ao clicar em um canal no player, o frontend pode chamar `GET /api/epg/br-band` para receber a lista cronológica de todos os programas do dia com sinopse, horários de início e fim.

---

## 🛡️ Solução para CORS e Bloqueios no Navegador

### Por que o navegador bloqueia IPTV direto?
- **CORS:** A maioria das transmissões de TV ao vivo e serviços FAST (como Pluto TV) envia cabeçalhos como `Access-Control-Allow-Origin: http://pluto.tv` ou nenhum cabeçalho CORS. O navegador bloqueia a requisição de qualquer player rodando em outro domínio ou `localhost`.
- **Formato MPEG-TS:** Vários canais transmitem em formato `.ts` contínuo, que faz com que players baseados em `hls.js` falhem por esperar um manifesto `.m3u8`.

### Como a API resolve isso?
1. **Stream Proxy Integrado (`/live/:channelId.m3u8` e `/proxy?url=...`):**
   - O player do seu site requisita o canal para a sua própria API (`http://localhost:1414/live/br-band.m3u8`).
   - A API Node.js (que **não** sofre restrições de CORS do navegador) busca os dados no servidor de transmissão original, simula cabeçalhos de navegadores e players legítimos e devolve o vídeo com `Access-Control-Allow-Origin: *`.
   - Manifestos HLS têm suas URLs de fragmentos (`.ts`) reescritas para também passarem pelo proxy, garantindo que o vídeo toque sem nenhuma falha.
2. **Filtragem Estrita de Streams Incompatíveis / Geo-Bloqueados:**
   - Durante a verificação, a API não apenas checa se a URL responde 200: **ela baixa o manifesto HLS e testa o download do primeiro fragmento de vídeo real**.
   - Streams com bloqueio geográfico real (que rejeitam conexões brasileiras) ou que retornam erros 403, 414 ou 502 são **automaticamente descartados e eliminados da lista**.

---

## 📋 Exemplo de Objeto de Canal no JSON

```json
{
  "id": "br-band",
  "name": "Band",
  "country": "BR",
  "countryName": "Brasil",
  "category": "Geral / Notícias",
  "logo": "https://i.imgur.com/1r5T6Pw.png",
  "streamUrl": "http://170.84.165.204/BAND_HD/index.m3u8",
  "liveUrl": "http://localhost:1414/live/br-band.m3u8",
  "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F170.84.165.204%2FBAND_HD%2Findex.m3u8",
  "corsNative": true,
  "isHls": true,
  "latencyMs": 142,
  "epg": {
    "hasEpg": true,
    "channelId": "BAND HD",
    "channelName": "BAND HD",
    "source": "BrazilTVEPG - Principal",
    "epgEndpoint": "/api/epg/br-band",
    "now": {
      "title": "Jornal da Band",
      "description": "As principais notícias do Brasil e do mundo.",
      "start": "2026-10-27T22:30:00.000Z",
      "stop": "2026-10-27T23:30:00.000Z",
      "progressPercent": 42
    },
    "next": {
      "title": "Melhor da Noite",
      "description": "Programa de atualidades e variedades.",
      "start": "2026-10-27T23:30:00.000Z",
      "stop": "2026-10-28T00:45:00.000Z"
    }
  }
}
```
No seu player web, basta utilizar `channel.liveUrl` (ou `channel.streamUrl` se `channel.corsNative` for `true`).
