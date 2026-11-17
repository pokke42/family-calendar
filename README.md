# Hemma – familjekalender

En lätt webbapp för familjens kalender, med iPad Air 2 som mål. Första versionen är en **lokal prototyp**, inte en färdig ansluten kalendertjänst. Gränssnittet är på svenska.

## Köra

Node.js 24 och npm används för utveckling. Node-servern behövs för kalenderprenumerationer. Den körs på Macen vid lokal testning. Statisk hosting ger bara lokal kalender och manuell import, inte serverkopplingarna.

```sh
cd /workspace/family-calendar
npm ci --cache /tmp/family-calendar-npm --no-audit --no-fund
npm run build
npm test
npm run dev
```

Utvecklingsservern lyssnar på port 3000 (`PORT` kan ändra porten). Den serverar `dist/`; bygg igen efter källkodsändringar. Webbläsartester: `CHROMIUM_PATH=/usr/bin/chromium npm run test:ui` i molnmiljön. På annan dator: installera Playwright Chromium med `npx playwright install chromium` och kör `npm run test:ui`.

## Fungerar nu

- Apple Kalender-inspirerat gränssnitt med dag-, vecko- och månadsvy, periodanpassad navigering och dagens datum. Vald vy sparas lokalt.
- Dag och vecka har tidsaxel, separata spalter för överlappande aktiviteter och en särskild rad för heldagar. Månad har ett datumrutnät; tryck på ett datum för att öppna dagen.
- Helskärmsläge döljer sidofält och apphuvud. Veckans sju dagar och hela dygnets 24 timmar får plats samtidigt, även när iPaden roteras. Avsluta med knappen eller Escape.
- Håkan, Johanna, Olle och Emil är förvalda medlemmar. Tidigare generiska namn migreras utan att ändra aktiviteter, person-id eller egna anpassade namn.
- Filter som kombineras för person, skola/idrott/familj/övrigt och varje individuell kalenderkälla. En källa per barn och aktivitet ger separat filtrering.
- Egna aktiviteter med tid, plats och eventuell HTTPS-länk till kallelse.
- Familjemedlemmar vars visningsnamn kan ändras under kalenderkällor.
- Manuell import av ICS-filer. Förvalda källor: Apple/iCloud, Outlook, InfoMentor, SportAdmin och Svenska Lag; fler källor kan läggas till.
- Återkommande händelser, undantag, flyttade händelser, heldagar och tidszonsdefinitioner i ICS. Kalenderlänkar från `URL` öppnas i källtjänsten.
- Lokal lagring på just den enheten. Anslutna kalenderlänkar lagras på den lokala Node-servern; hämtade aktiviteter läses därifrån. Exempeldata är tydligt märkt och kan tömmas.

Importen är en ögonblicksbild, inte en prenumeration. Den omfattar cirka en månad bakåt och ett år framåt. Nästa import ersätter tidigare importerade händelser från samma källa. Begränsningar: 2 MB per manuellt importerad fil i webbläsaren, 20 MB för serverhämtade prenumerationer och 5 000 händelser per import och högst 30 000 upprepningssteg. Kalenderns `VTIMEZONE` eller UTC krävs för tidsatta zonbundna händelser; okända tidszoner avvisas i stället för att gissa. Flytande tider visas som lokal tid. Lokal data kan försvinna när Safari rensas och delas inte mellan enheter. Det finns ännu ingen redigering av importerade händelser eller export av den lokala kalendern.

## iPad Air 2

Använd iPadOS 15 med senaste tillgängliga uppdateringen. JavaScript byggs för Safari 15. Vanlig JavaScript och CSS, systemtypsnitt, inga bildpaket, inga UI-ramverk, lätt kontroll av serverns cache en gång per minut när sidan är synlig och ingen tung animationsmotor. Bara vald dag, vecka eller månadsrutnät med 42 datum renderas åt gången. Appens JavaScript är cirka 103 kB okomprimerat i första versionen; produktionsvärden bör använda Brotli/gzip.

Helskärmsläget använder webbläsarens Fullscreen API när det finns, med ett CSS-baserat läge som fungerar även när det saknas. Safari på äldre iPad kan behålla sina verktygsfält. För en fristående vy: välj **Dela → Lägg till på hemskärmen** i Safari och öppna sedan appen därifrån. Meta-inställningar för Apples webbappläge finns i appen.

Verifierat i Chromium med skärmstorlekar 1024 × 768, 768 × 1024 och 375 × 1024. Det är **inte** ett test på fysisk iPad eller i Safari. Testa respons, touch, ICS-import och återöppning i Safari på den faktiska iPaden innan vardagsbruk. Stora kalendrar kan kräva serverbaserad import.

## Rekommenderad drift och nästa integrationssteg

**Supabase i en EU-region** för PostgreSQL och inloggning; **Cloudflare Pages** för den statiska appen (`npm ci && npm run build`, publicera `dist/`). Det gör webbappen liten och flyttar synkjobben från iPaden till en server. Inga konton eller molnresurser har skapats, ingen app har publicerats och inga Supabase-anrop finns ännu i prototypen. Kontrollera aktuella priser, kvoter och tillgänglighetsvillkor innan drift.

Föreslagen datamodell: `families`, `family_members`, `people`, `calendar_sources`, `events` och `event_people`. Varje kalenderkälla och händelse ska tillhöra en familj. Supabase Auth hanterar vuxnas inloggning. Aktivera Row Level Security så att en inloggad användare bara kan läsa/ändra sin familjs uppgifter genom sitt medlemskap; barn ska inte behöva egna konton för att synas i kalendern. Privilegierade nycklar och externa kontouppgifter ska bara finnas på servern. Serverjobbet lagrar senaste synkstatus och uppdaterar händelser idempotent med källans UID och återkomst-id.

| Källa | Import i prototypen | Automatisk koppling som återstår |
| --- | --- | --- |
| Apple/iCloud | Serverhämtad prenumeration eller ICS-fil | Familj kopplas till Håkan och Johanna. Publicerad prenumeration är skrivskyddad; privat kontokoppling kräver separat autentisering. |
| Outlook | Exporterad ICS-fil | Kalenderprenumeration om tillgänglig, alternativt Microsoft Graph med delegerad OAuth och minsta läsbehörighet. |
| InfoMentor | ICS-fil eller serverhämtad kalenderprenumeration | Kräver en fungerande prenumerationslänk från skolan. |
| SportAdmin | ICS-fil eller serverhämtad kalenderprenumeration | Kallelsesvar behöver separat integrationsstöd. |
| Svenska Lag | ICS-fil eller serverhämtad kalenderprenumeration | Kallelsesvar behöver separat integrationsstöd. |

**Svar på kallelser:** ICS räcker inte för att bekräfta närvaro. Direkt svar i SportAdmin och Svenska Lag är inte implementerat och kräver verifierade, tillåtna API:er samt separat autentisering. Nu kan användaren öppna aktivitetens HTTPS-länk, om importen innehåller en sådan, och svara i källtjänsten. Appen visar inga falska ja/nej-knappar. Det återstår att kontrollera detta mot de faktiska tjänsterna och era föreningar.

För att gå från prototyp till delad vardagsapp behövs ett valt Supabase-projekt, inloggning och familjemedlemskap med testade åtkomstregler, samt tillgång till de faktiska kalenderexporterna/prenumerationerna. Därefter kan schemalagd synk, konflikthantering och säker cache införas. Serverbaserad synk ska inte lämna åtkomstlänkar, lösenord eller OAuth-token i webbläsarens lokala lagring.

Kalendertolkningen använder oförändrad [ical.js 2.2.1](https://github.com/mozilla-comm/ical.js/tree/v2.2.1), Mozilla Public License 2.0. Licenstexten följer med produktionsbygget som `ical.js.LICENSE.txt`. Övriga npm-paket används som utvecklingsverktyg.


## Kalenderanslutningar och privat familjefil

Under Hantera kalenderkällor kan InfoMentor, SportAdmin och Svenska Lag anslutas med en ICS-prenumerationslänk (`https://`, `webcal://` eller `webcals://`). Hämtning sker på servern vid anslutning, serverstart och sedan var 15:e minut. Uppdatera nu gör högst en ny hämtning per minut. Misslyckad synk behåller senaste kalendern och visar felstatus. Detta är kalenderläsning; direkta svar på kallelser och kontoinloggning till leverantörerna är inte implementerade. Integrationen har testats med testdata; faktisk åtkomst beror på respektive prenumerationslänk och nätverk.

Servern sparar länkar och cache i `.local/connections.json` (ignoreras av Git). `CALENDAR_STORE` kan ange annan privat sökväg. Som standard tillåter API:et bara åtkomst via localhost på serverdatorn. Kalenderanslutningar ändras alltid via localhost. Det valfria CALENDAR_LAN_HOST-läget nedan ger skrivskyddad läsning på hemnätet. API:et ska inte exponeras publikt. Standardvärdar ligger under tjänsternas domäner. Om InfoMentor länkar vidare till en extern schematjänst kan dess exakta värdnamn anges i `CALENDAR_ALLOWED_HOSTS`, kommaseparerat. HTTPS, publik DNS-adress och varje omdirigering kontrolleras.

En separat privat `*.family.private.json`-fil kan importeras via **Hantera kalenderkällor → Importera privat familjefil**. Den innehåller `version: 1`, `connections` (objekt med `source` och `url`) och `calendars` (objekt med `source` och `ics`). Privata länkar sparas bara på servern. Länkar som inte kan hämtas sparas som väntande, med felstatus. Veckoscheman lagras som återkommande mallar i webbläsaren och fortsätter gälla tills en ny fil med samma käll-id laddas upp. Lov, studiedagar och terminsgränser dras inte av automatiskt. Importen tar bort exempelaktiviteter; egna aktiviteter behålls. Privata filer, PDF-scheman och prenumerationslänkar ska inte läggas i Git.

På Mac: `cd /Users/hakanroos/Documents/ChatGPT/family-cal`, `git pull`, `npm ci --include=dev`, `npm run build`, `npm run dev`. Öppna sedan http://localhost:3000 och importera den privata familjefilen. Servern behöver vara igång för uppdateringar. Spara den privata filen separat från GitHub.

Safari kan inte läsa Kalender-appens iCloud-data genom iPadens kontoinloggning. Källan Familj stöder i stället publicerad iCloud-prenumeration via servern, samt ICS-import. Länken lagras bara på servern och i den privata familjefilen. Kopplingen läser kalendern; nya aktiviteter i appen sparas lokalt och skrivs inte tillbaka till iCloud. De tidigare källorna Fotboll, Gymnastik och Egna aktiviteter tas bort vid uppgradering. Egna lokala aktiviteter flyttas till Familj.

## Kalenderfärger

Öppna Hantera kalenderkällor och välj Kalenderfärg på respektive källa. Färgen används för aktivitetens kant och ljusa bakgrund i alla tre vyer. Valet sparas i webbläsaren på respektive enhet. Filtren för person fungerar som tidigare.

## Kostnadsfri användning på iPad hemma

Enklast utan hostingavgift är att köra servern på den befintliga Macen och läsa kalendern från iPaden på samma betrodda Wi-Fi. Macen måste vara på och servern igång; detta ger inte åtkomst utanför hemnätet. Macen använder förstås ström. Det behövs inget molnkonto, kort eller abonnemang. Gratis statisk hosting, exempelvis GitHub Pages, kan inte köra denna appens Node-server och kalenderhämtning.

1. Uppdatera på Macen och bygg:

   ```sh
   cd /Users/hakanroos/Documents/ChatGPT/family-cal
   git pull
   npm ci --include=dev
   npm run build
   ```

2. Starta med läsåtkomst på hemnätet och hindra viloläge medan processen körs:

   ```sh
   CALENDAR_LAN_HOST="$(ipconfig getifaddr en0)" caffeinate -i npm run dev
   ```

   Macens Wi-Fi använder vanligen en0. Om ingen iPad-adress visas, hitta Wi-Fi-adressen i Systeminställningar → Wi-Fi → Detaljer → TCP/IP och ersätt kommandot med till exempel `CALENDAR_LAN_HOST=192.168.1.20 caffeinate -i npm run dev` (använd din egen adress). Låt Macens lock vara öppet. Tillåt Node i macOS-brandväggen om systemet frågar.

3. På Macen: öppna http://localhost:3000 och importera den senaste privata familjefilen igen under Hantera kalenderkällor. Denna version sparar även veckoschemana på servern för läsning från iPaden. Bekräfta status på varje prenumeration. Importera inte den privata filen på iPaden.
4. Servern skriver ut en adress som `http://192.168.1.20:3000`. Öppna den adressen i Safari på iPaden. Båda enheterna måste vara på samma nät; gästnät med klientisolering fungerar inte. Välj sedan Dela → Lägg till på hemskärmen om du vill.

`CALENDAR_LAN_HOST` öppnar endast läsning av den redan hämtade kalendern och veckoschemana för enheter med privat nätadress, med rätt värdnamn och ursprung. Prenumerationslänkar skickas aldrig i detta API. Anslutningar och schemaimport ändras på Macen via localhost. Alla på det betrodda nätet som känner till adressen kan läsa kalendern. Gör ingen portvidarebefordran till internet. För åtkomst utanför hemmet behövs en separat lösning med HTTPS och autentisering.

Aktiviteter som skapas manuellt, namnändringar, filter och färgval är fortfarande lokala för respektive webbläsare. Kalenderprenumerationer och importerade veckoscheman kommer från Macens server. Nätverksläget har testats med simulerade nätverksförfrågningar; fysisk iPad och macOS-brandvägg behöver verifieras på dina enheter.

## Felsöka misslyckad kalendersynk

På Macen, från projektmappen, kör `npm run diagnose -- icloud`. Kommandot läser den sparade anslutningen och gör en ny hämtning och import utan att ändra inställningar eller cache. Det skriver bara ut steg, felkod, en säker felbeskrivning och vid framgång storlek och antal aktiviteter. Privata länkar och aktivitetstexter skrivs inte ut. Koder: DNS (namnuppslagning), TLS (certifikat), TIMEOUT, HTTP_401/403/404/410 etc., NOT_CALENDAR, TIMEZONE, EVENT_FIELDS, RECURRENCE_LIMIT och PARSE. Ett misslyckat test avslutas med status 1. Skicka den utskrivna diagnosen för fortsatt felsökning. Starta om servern efter `git pull` för att även få de nya felmeddelandena i appen. Byt inte kalenderlänk enbart utifrån det äldre generella synkfelet.


Serverhämtning och diagnos stöder kalenderfiler upp till 20 MB, exempelvis iCloud-kalendrar med lång historik. Servern tolkar filen och sparar bara normaliserade aktiviteter inom importfönstret (cirka en månad bakåt och ett år framåt); råfil, gamla aktivitetstexter och bilagor skickas inte till iPaden. Manuell import i webbläsaren har kvar gränsen 2 MB. Gränserna för antal aktiviteter och upprepningar finns kvar. Kör `npm run diagnose -- icloud` igen efter uppdatering om tidigare fel var SIZE och starta om servern för att använda den nya gränsen.
