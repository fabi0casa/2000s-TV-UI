# 📺 IPTV & EPG Curated API

API Node.js de alta performance desenvolvida para validar links de transmissão IPTV (Brasil e Estados Unidos), desduplicar canais, associar metadados e guias de programação (EPG) e fornecer um JSON limpo e atualizado através da **porta 1414** com re-verificação automática a cada **72 horas**.

---

## 🚀 Como Executar

### 1. Pré-requisitos
- **Node.js** v18+ (testado e otimizado no Node.js v24).
- Não requer instalação de pacotes externos (`node_modules`) — usa recursos nativos modernos de rede e streaming do Node.js.

### 2. Iniciar o Servidor
No terminal, dentro da pasta `api`:
```bash
npm start
```
ou diretamente:
```bash
node server.js
```

O servidor iniciará imediatamente em **`http://localhost:1414`**.

---

## 📡 Endpoints da API

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/` | Painel informativo de boas-vindas com status do servidor e links rápidos |
| `GET` | `/channels.json` | **Arquivo JSON principal** contendo todos os canais ativos, tratados e com EPG |
| `GET` | `/api/channels` | Alias para `/channels.json`, com suporte a filtros via query string |
| `GET` | `/api/channels/br` | Retorna somente os canais ativos do **Brasil** |
| `GET` | `/api/channels/us` | Retorna somente os canais ativos dos **Estados Unidos** |
| `GET` | `/api/status` | Retorna o status em tempo real da validação, progresso e próximo agendamento |
| `GET` | `/api/epg` | Lista as fontes de dados EPG utilizadas e estatísticas |
| `POST` / `GET` | `/api/refresh` | Força um ciclo imediato de validação e re-verificação das fontes |

### Exemplos de Filtros em `/api/channels`
- Filtrar por país: `http://localhost:1414/api/channels?country=BR`
- Filtrar por categoria: `http://localhost:1414/api/channels?category=Notícias`
- Buscar por nome: `http://localhost:1414/api/channels?search=globo`
- Somente canais com grade EPG: `http://localhost:1414/api/channels?hasEpg=true`

---

## ⚙️ Arquitetura e Funcionalidades

### 1. Fontes de Canais IPTV Integradas
- **IPTV-Org**:
  - `https://iptv-org.github.io/iptv/countries/br.m3u` (Brasil)
  - `https://iptv-org.github.io/iptv/countries/us.m3u` (EUA)
  - `https://iptv-org.github.io/api/channels.json` (Metadados oficiais)
- **IPTV Brasil 2026 (Ramys)**:
  - `Canais.m3u8` (Canais de transmissão abertos e fechados)
  - `CanaisBR03.m3u8` (Transmissões diretas HD)

### 2. Validação Ativa de Streams (`streamTester.js`)
- Executa testes HTTP controlados por um pool concorrente (25 conexões simultâneas).
- Timeout de 3.5 segundos por conexão para evitar bloqueios.
- Tenta requisição `HEAD` primeiro; caso o servidor restrinja, realiza requisição `GET` com Range parcial (`bytes=0-1024`) e encerra o leitor do stream imediatamente.
- Filtra streams inativos e registra a latência real de resposta em milissegundos.

### 3. Associação Inteligente com EPG (`epgParser.js`)
Consolida em tempo real guias de programação dos dois repositórios solicitados:
- **BrazilTVEPG (`limaalef/BrazilTVEPG`)**:
  - `epg.xml`, `claro.xml`, `globo.xml`, `vivoplay.xml`, `maissbt.xml`, `xsports.xml`.
- **IPTV-Org EPG (`iptv-org/epg` / `iptv-epg.org`)**:
  - `epg-br.xml` (Brasil) e `epg-us.xml` (Estados Unidos).
- Associa o canal por `tvg-id`, nome canônico normalizado ou busca fonética aproximada.
- Detecta o programa que está passando **agora** (`now`) e o próximo (`next`).

### 4. Tratamento e Desduplicação (`matcher.js`)
- Remove termos redundantes de resolução/codecs do título (`FHD`, `HD`, `SD`, `4K`, `H.265`, `720p`, etc.).
- Agrupa transmissões do mesmo canal em um único objeto canônico.
- O stream com menor latência é definido como primário (`streamUrl`), e os demais streams ativos são preservados no array `backupStreams` para redundância.

### 5. Ciclo de Atualização a cada 72 Horas
- O arquivo `data/channels.json` é gerado e mantido no disco.
- Ao iniciar, se o cache tiver menos de 72 horas, o servidor atende instantaneamente.
- O timer interno reexecuta a verificação completa a cada 72 horas em segundo plano sem indisponibilidade de serviço.

---

## 📋 Estrutura do Arquivo `channels.json` Gerado

```json
{
  "meta": {
    "title": "IPTV & EPG Curated API",
    "version": "1.0.0",
    "generatedAt": "2026-10-27T03:00:00.000Z",
    "nextUpdateAt": "2026-10-30T03:00:00.000Z",
    "updateIntervalHours": 72,
    "totalChannels": 420,
    "channelsByCountry": {
      "BR": 175,
      "US": 245
    },
    "totalActiveStreams": 580,
    "epgMatchedChannels": 385,
    "epgMatchRate": "92%",
    "syncDurationSeconds": 145
  },
  "channels": [
    {
      "id": "br-band",
      "name": "Band",
      "country": "BR",
      "countryName": "Brasil",
      "category": "Geral / Notícias",
      "logo": "https://i.imgur.com/1r5T6Pw.png",
      "streamUrl": "http://170.84.165.204/BAND_HD/index.m3u8",
      "backupStreams": [
        "http://45.185.11.126:8000/play/a076/index.m3u8"
      ],
      "totalStreamsAvailable": 2,
      "latencyMs": 142,
      "statusCode": 200,
      "verifiedAt": "2026-10-27T03:02:15.120Z",
      "epg": {
        "hasEpg": true,
        "channelId": "BAND HD",
        "channelName": "BAND HD",
        "source": "BrazilTVEPG - Principal",
        "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
        "now": {
          "title": "Jornal da Band",
          "description": "As principais notícias do Brasil e do mundo com análise detalhada.",
          "category": "Jornalismo",
          "start": "2026-10-27T22:30:00.000Z",
          "stop": "2026-10-27T23:30:00.000Z"
        },
        "next": {
          "title": "Melhor da Noite",
          "description": "Programa de variedades e entretenimento ao vivo.",
          "category": "Entretenimento",
          "start": "2026-10-27T23:30:00.000Z",
          "stop": "2026-10-28T00:45:00.000Z"
        }
      }
    }
  ]
}
```
