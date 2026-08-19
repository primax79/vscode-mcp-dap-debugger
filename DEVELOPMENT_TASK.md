# Development task: hardening di `vscode-mcp-dap-debugger`

## Contesto

`vscode-mcp-dap-debugger` e una riscrittura dell'estensione originale che espone il debugger di VS Code
tramite MCP. La nuova implementazione ha gia corretto problemi importanti del progetto precedente:

- un'istanza `McpServer` separata per ogni sessione client;
- autenticazione tramite token e binding su `127.0.0.1`;
- tracking reale dei messaggi DAP, della console e delle eccezioni;
- supporto per sessioni e thread multipli;
- dipendenze runtime incluse nel bundle.

Durante la revisione alcuni file relativi alla conservazione delle sessioni terminate erano in corso
di modifica. Sullo snapshot finale `typecheck`, lint e build passano. Gli errori TypeScript osservati
durante quella modifica non sono quindi un problema aperto.

Questo task copre esclusivamente i problemi ancora presenti e verificati nel codice corrente.

## Confronto con il progetto padre

Il riferimento confrontato e `/Users/Alfredo/works/ai-coding-tools/mcp-debug-tools`, versione
`mcp-debug-tools` 1.0.2. La directory corrente non e un semplice aggiornamento incrementale: e una
riscrittura piu piccola, con nomi di pacchetto, comandi, directory di discovery, porta e protocollo di
autenticazione differenti.

### Correzioni reali introdotte dalla riscrittura

| Area                  | Progetto padre                                                                                                                                                               | Riscrittura corrente                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Sessioni MCP          | Un solo `McpServer` globale connesso a transport diversi; una seconda connessione puo bloccarsi e il codice e esposto al problema di cross-client state leakage              | Un nuovo `McpServer` e un nuovo transport per ogni sessione, con cleanup e TTL                                   |
| Sicurezza HTTP        | Nessuna autenticazione, bind non limitato esplicitamente a loopback, DNS rebinding protection disabilitata e `tools/call` gestito anche tramite bypass diretto del transport | Bind su `127.0.0.1`, token per istanza su ogni richiesta, DNS rebinding protection attiva, nessun bypass diretto |
| DAP tracking          | `DebugAdapterTracker` vuoto; DAP log, console ed eccezioni restituiscono placeholder                                                                                         | Ring buffer per sessione con messaggi DAP, output console ed eccezioni reali                                     |
| Multi-sessione        | Quasi tutti i tool operano solo su `activeDebugSession` e i comandi di stepping agiscono sul focus UI                                                                        | Session store esplicito; tool principali accettano `sessionId`, `threadId` e `frameId`                           |
| Logpoint              | `logMessage` accettato dallo schema ma non applicato al breakpoint                                                                                                           | `logMessage` passato al costruttore di `SourceBreakpoint`                                                        |
| Lifecycle comandi     | Activation e comandi start/stop contengono due implementazioni differenti; il riavvio manuale non riallinea config e registry                                                | Un solo lifecycle condiviso tra activation e comandi, pur con la race di startup ancora aperta                   |
| Packaging             | Due manifest copiati alternativamente, output TypeScript non bundleizzato e `commander` non dichiarato; il checkout corrente non compila                                     | Un solo manifest ed esbuild per extension e CLI; `commander` dichiarato e incluso nel bundle                     |
| Dipendenze installate | MCP SDK 1.17.1 ed Express 4.21.2; l'audit runtime corrente segnala vulnerabilita alte/moderate                                                                               | MCP SDK 1.30.0 ed Express 4.22.2; audit runtime corrente pulito                                                  |
| Manutenibilita        | Circa 4.500 righe, inclusi `tools.ts` da oltre 1.700 righe e `resources.ts` da circa 475                                                                                     | Circa 2.600 righe distribuite per responsabilita                                                                 |

Il progetto padre dichiara uno script `test`, ma non contiene i file `out/test/**/*.test.js` attesi da
`.vscode-test.mjs`; inoltre il suo `pretest` si ferma gia in compilazione per la dipendenza
`commander` assente. La riscrittura non ha quindi perso una suite effettiva: resta comunque necessario
introdurne una prima della pubblicazione.

### Problemi ereditati dal progetto padre

- **Lifecycle HTTP non atteso:** entrambe le versioni restituiscono da `startHttpServer()` prima del
  callback `listening`. La riscrittura ha centralizzato il lifecycle, ma non ha corretto questa race.
- **Parser JSONC a regex:** `src/utils/json.ts` conserva la stessa strategia del padre e corrompe
  delimitatori di commento presenti nelle stringhe.
- **Registry read-modify-write:** entrambe le versioni aggiornano un unico JSON globale senza lock o
  rename atomico e rimuovono la precedente entry dello stesso workspace.
- **Scelta automatica della prima istanza:** entrambe le versioni selezionano `instances[0]` quando il
  fallback globale trova piu istanze.
- **Iniezione skill con overwrite:** il comportamento nasce nel progetto padre. La riscrittura ha
  aggiunto configurazione e notifica, ma mantiene default attivo e sovrascrittura incondizionata.
- **Multi-root limitato:** configurazione, discovery e diversi tool continuano a privilegiare il
  primo workspace folder.

### Problemi specifici o accentuati dalla riscrittura

- L'autenticazione rende porta e token una coppia indivisibile. La logica CLI corrente puo invece
  combinare un `--port` esplicito con il token autodiscoverato da un'altra istanza; il padre, non
  avendo token, non poteva presentare questo specifico errore.
- Le risorse MCP sono passate da nove a tre. La riduzione elimina duplicazioni e placeholder, ma e una
  breaking change per client che usano URI come `debug://console`, `debug://call-stack` o
  `debug://variables-scope`; le operazioni equivalenti restano disponibili come tool.
- Sono cambiati package/bin (`@uhd_kr/mcp-debug-tools` / `mcp-debug-tools` -> `vscode-mcp-dap-debugger`),
  command ID (`dap-proxy.*` -> `vscode-mcp-dap-debugger.*`), directory config (`.mcp-debug-tools` ->
  `.vscode-mcp-dap-debugger`) e porta predefinita (8890 -> 8891). Serve una strategia di migrazione o una
  dichiarazione esplicita di incompatibilita.
- Il manifest della riscrittura usa ancora `publisher: "local-dev"`, repository vuoto e documentazione
  prevalentemente orientata allo sviluppo; il padre dispone invece di metadata e guida utente gia
  pubblicati, anche se descrivono funzionalita non sempre corrispondenti all'implementazione.

### Implicazione per questo task

La riscrittura e una base tecnica nettamente migliore del progetto padre e non conviene tornare
all'architettura precedente. Le correzioni P0/P1 sotto riportate vanno implementate sulla riscrittura,
usando il padre solo per verificare compatibilita e flussi utente. Non bisogna reintrodurre il server
MCP globale, il bypass diretto di `tools/call`, le risorse placeholder o il build a manifest multipli.

## Stato iniziale verificato

```text
npm run typecheck  PASS
npm run lint       PASS
npm run build      PASS
npm audit --omit=dev  0 vulnerabilita runtime
npm test           FAIL: script "test" non definito
```

## P0 - Rendere atomico il lifecycle del server HTTP

### Problema

`startHttpServer()` e dichiarata `async`, ma restituisce subito dopo la chiamata ad `app.listen()` e
non aspetta l'evento `listening`. Il callback `onServerStarted` viene inoltre avviato con `void`, percio
eventuali errori o ritardi nella creazione del token, del file di configurazione e del registry non
sono osservabili dal chiamante.

File coinvolti:

- `src/server/http-server.ts`
- `src/server-lifecycle.ts`
- `src/extension.ts`
- `src/commands.ts`

Possibili effetti:

- `await startServer()` termina prima che il server sia realmente pronto;
- la status bar puo mostrare `running` con porta non ancora valorizzata;
- un secondo avvio nella finestra tra `listen()` e `listening` puo superare
  `state.isServerRunning()`;
- uno stop nella stessa finestra puo non fermare il listener in avvio;
- gli errori emessi dal server o dall'inizializzazione post-listen non vengono propagati correttamente.

### Intervento richiesto

- Fare in modo che `startHttpServer()` si risolva solo dopo `listening` e si rigetti su `error`.
- Attendere `onServerStarted` prima di considerare completato l'avvio.
- Introdurre uno stato esplicito almeno per `stopped`, `starting`, `running` e `stopping`, oppure una
  singola Promise di avvio condivisa che renda start/stop idempotenti durante le transizioni.
- Ripristinare completamente lo stato se listen o inizializzazione falliscono.
- Decidere esplicitamente se un errore di scrittura della configurazione debba fermare il server. La
  scelta consigliata e fallire l'avvio, perche senza configurazione la CLI non puo autenticarsi.

### Criteri di accettazione

- Dopo `await startServer()`, porta, token, file workspace e registry sono pronti.
- Due chiamate concorrenti a `startServer()` producono un solo listener.
- `stopServer()` durante `starting` lascia il sistema completamente fermo e senza file stale.
- Un errore `EADDRINUSE` o un errore nel callback di inizializzazione raggiunge il chiamante.
- Nessuna Promise viene lasciata senza handler.

## P0 - Correggere la selezione CLI di porta e token

### Problema

La CLI tratta porta e token come valori indipendenti. Se viene fornito `--port` senza `--token`,
mantiene la porta esplicita ma completa il token usando l'istanza restituita dall'auto-discovery. Con
piu istanze questo puo associare la porta di un'istanza al token di un'altra.

Inoltre, quando non trova una configurazione nel workspace, `ConfigFinder.findVSCodeInstance()`
seleziona sempre `instances[0]`, anche quando il registry contiene piu istanze. Questo non corrisponde
alla documentazione, che suggerisce una selezione non ambigua e l'uso di `--port` per scegliere.

File coinvolti:

- `src/cli/cli.ts`
- `src/config/config-finder.ts`
- `src/tools/workspace.ts`
- `resources/skills/ai-debugger.md`

### Intervento richiesto

- Considerare porta e token come una singola identita di connessione.
- Se viene fornita solo la porta, cercare nel registry l'entry con quella porta e usarne il token.
- Se la porta non e presente nel registry, richiedere anche `--token` e terminare con un errore chiaro.
- Se l'auto-discovery globale trova piu istanze e non esiste un match deterministico per il workspace,
  fallire elencando workspace e porte disponibili invece di scegliere la prima.
- Allineare skill e README al comportamento implementato.
- Chiarire il ruolo di `select-vscode-instance`: attualmente restituisce una raccomandazione, ma non
  cambia la connessione del processo CLI gia in esecuzione.

### Criteri di accettazione

- La CLI non combina mai porta e token provenienti da entry diverse.
- `--port <porta-registrata>` funziona senza dover copiare manualmente il token.
- Una selezione globale ambigua produce un errore deterministico e utile.
- I messaggi non stampano il token.

## P0 - Sostituire il parser JSONC basato su regex

### Problema

`src/utils/json.ts` elimina i commenti usando espressioni regolari. Le regex non distinguono i
commenti dal contenuto delle stringhe JSON.

Casi gia riprodotti:

```jsonc
{"url": "http://localhost:3000"} // diventa JSON non valido: "http:
{"pattern": "a/*b*/c"}           // viene alterato silenziosamente in "ac"
```

Questo puo impedire la lettura di configurazioni `launch.json` valide o, peggio, cambiarne il
contenuto senza segnalazione.

### Intervento richiesto

- Usare un parser JSONC reale, preferibilmente `jsonc-parser`, oppure un'API VS Code che esponga le
  configurazioni gia interpretate.
- Eliminare `removeJsonComments()` se non resta alcun altro consumatore.
- Conservare messaggi di errore che indichino file e posizione del problema.

### Criteri di accettazione

- URL, pattern e stringhe contenenti `//`, `/*` o `*/` restano invariati.
- Commenti lineari e a blocchi continuano a essere accettati.
- Virgole finali, normalmente ammesse nei file JSONC di VS Code, sono gestite.

## P1 - Rendere sicura e non invasiva l'iniezione delle skill

### Problema

`WorkspaceConfigManager.maybeInjectSkillDocument()` scrive automaticamente in `.claude/skills` e
`.gemini/skills` a ogni inizializzazione. L'opzione e attiva per default e `writeFile()` sovrascrive
eventuali skill personalizzate prima di mostrare la notifica.

File coinvolti:

- `src/config/workspace-config.ts`
- `package.json`
- `README.md`

### Intervento richiesto

- Non sovrascrivere mai un file esistente senza consenso esplicito.
- Preferire default `false`, oppure una richiesta preventiva una tantum con scelte installa/non
  installare/non chiedere piu.
- Rispettare il workspace trust di VS Code.
- Verificare che destinazione e componenti del percorso non siano symlink prima della scrittura,
  oppure usare una strategia equivalente che non segua link non fidati.
- Se il progetto deve aggiornare file precedentemente generati, registrarvi una firma/versione e
  aggiornarli solo se risultano ancora non modificati dall'utente.

### Criteri di accettazione

- Aprire un workspace non modifica file agent senza consenso o configurazione gia esplicita.
- Una skill esistente e personalizzata non viene sovrascritta.
- La notifica descrive l'azione prima della prima scrittura oppure conferma una scelta gia salvata.

## P1 - Rendere atomico il registry globale

### Problema

`src/config/registry.ts` usa sequenze read-modify-write su un unico file globale senza lock e senza
rename atomico. Piu processi VS Code possono leggere la stessa versione e sovrascrivere gli
aggiornamenti reciproci. Una lettura durante una scrittura puo anche osservare JSON parziale.

La registrazione di una seconda istanza sullo stesso workspace restituisce la precedente come
`replacedLiveInstance`, ma la rimuove comunque dal registry. Questo rende il warning sull'ambiguita
incoerente con lo stato effettivamente conservato.

### Intervento richiesto

- Scrivere su file temporaneo nella stessa directory e usare rename atomico.
- Serializzare gli aggiornamenti tra processi con un lock robusto, oppure sostituire il file condiviso
  con entry separate per istanza.
- Definire una policy chiara per due finestre sullo stesso workspace: conservarle entrambe e richiedere
  selezione, oppure impedire la seconda registrazione. Non sovrascrivere silenziosamente la prima.
- Gestire JSON corrotto senza perdere definitivamente tutte le entry recuperabili.
- Considerare PID reuse e verificare anche porta/istanza quando si determina se un'entry e viva.

### Criteri di accettazione

- Registrazioni concorrenti di istanze differenti non perdono entry.
- Lo sweeper non sovrascrive una registrazione avvenuta durante il proprio ciclo.
- La policy per workspace duplicati coincide con warning, discovery e documentazione.

## P1 - Introdurre test e quality gate di pubblicazione

### Problema

Non esiste uno script `test`. La build esbuild puo produrre bundle anche in presenza di errori di
tipo; `vscode:prepublish` esegue solo `npm run build`.

### Intervento richiesto

- Aggiungere un test runner e lo script `test`.
- Aggiungere `check`, ad esempio:

  ```json
  "check": "npm run typecheck && npm run lint && npm test && npm run build"
  ```

- Fare eseguire il quality gate a CI e `vscode:prepublish`/`prepublishOnly`.
- Evitare dipendenze dirette da un runtime VS Code reale nei test unitari: isolare i componenti puri e
  usare mock stretti per le API VS Code.

### Copertura minima richiesta

- lifecycle: start concorrenti, stop durante start, errori listen e cleanup;
- autenticazione: token assente, errato e valido;
- MCP: due client concorrenti con server e transport separati;
- discovery: zero, una e piu istanze; `--port` con token corretto;
- JSONC: commenti reali e delimitatori dentro stringhe;
- registry: aggiornamenti concorrenti e recovery da file incompleto;
- session store: sessione live, terminata, retention ed eviction;
- routing DAP: sessionId/threadId/frameId espliciti e casi ambigui.

## P2 - Packaging e documentazione

- Sostituire `publisher: "local-dev"` e valorizzare `repository.url` prima della pubblicazione.
- Allineare `@types/express` alla major di Express utilizzata.
- Valutare se escludere le source map dal pacchetto npm: il dry-run corrente include circa 7,8 MB
  non compressi.
- Documentare installazione extension, configurazione MCP persistente, CLI one-shot, multi-root e
  risoluzione dei problemi di discovery.
- Aggiornare il changelog con le correzioni effettivamente completate.

## Ordine di implementazione consigliato

1. Aggiungere l'infrastruttura di test e test di regressione che dimostrino i tre P0.
2. Correggere lifecycle HTTP.
3. Correggere discovery e accoppiamento porta/token.
4. Sostituire il parser JSONC.
5. Correggere iniezione skill e registry globale.
6. Completare quality gate, packaging e documentazione.

## Definition of done

Il task e completo quando:

- tutti i criteri di accettazione P0 e P1 sono coperti da test automatici;
- `npm run check` passa da un checkout pulito dopo `npm ci`;
- almeno due client MCP concorrenti sono verificati end-to-end;
- discovery e comandi one-shot sono verificati con due istanze VS Code simulate o reali;
- nessuna attivazione dell'estensione sovrascrive file utente senza consenso;
- README, skill e comportamento CLI descrivono la stessa politica di selezione;
- il pacchetto prodotto e installabile e il smoke test della CLI passa senza dipendenze globali.
