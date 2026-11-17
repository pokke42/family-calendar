# Hemma – familjekalender

En lätt webbapp för familjens kalender, med iPad Air 2 som mål. Första versionen är en **lokal prototyp**, inte en färdig ansluten kalendertjänst. Gränssnittet är på svenska.

## Köra

Node.js 24 och npm används för utveckling. Ingen Node-server behövs på iPaden eller på det framtida statiska webbhotellet.

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
- Lokal lagring på just den enheten. Inga familjeuppgifter skickas till någon backend. Exempeldata är tydligt märkt och kan tömmas.

Importen är en ögonblicksbild, inte en prenumeration. Den omfattar cirka en månad bakåt och ett år framåt. Nästa import ersätter tidigare importerade händelser från samma källa. Begränsningar: 2 MB per fil, 5 000 händelser per import och högst 30 000 upprepningssteg. Kalenderns `VTIMEZONE` eller UTC krävs för tidsatta zonbundna händelser; okända tidszoner avvisas i stället för att gissa. Flytande tider visas som lokal tid. Lokal data kan försvinna när Safari rensas och delas inte mellan enheter. Det finns ännu ingen redigering av importerade händelser eller export av den lokala kalendern.

## iPad Air 2

Använd iPadOS 15 med senaste tillgängliga uppdateringen. JavaScript byggs för Safari 15. Vanlig JavaScript och CSS, systemtypsnitt, inga bildpaket, inga UI-ramverk, ingen bakgrundspollning och ingen tung animationsmotor. Bara vald dag, vecka eller månadsrutnät med 42 datum renderas åt gången. Appens JavaScript är cirka 103 kB okomprimerat i första versionen; produktionsvärden bör använda Brotli/gzip.

Helskärmsläget använder webbläsarens Fullscreen API när det finns, med ett CSS-baserat läge som fungerar även när det saknas. Safari på äldre iPad kan behålla sina verktygsfält. För en fristående vy: välj **Dela → Lägg till på hemskärmen** i Safari och öppna sedan appen därifrån. Meta-inställningar för Apples webbappläge finns i appen.

Verifierat i Chromium med skärmstorlekar 1024 × 768, 768 × 1024 och 375 × 1024. Det är **inte** ett test på fysisk iPad eller i Safari. Testa respons, touch, ICS-import och återöppning i Safari på den faktiska iPaden innan vardagsbruk. Stora kalendrar kan kräva serverbaserad import.

## Rekommenderad drift och nästa integrationssteg

**Supabase i en EU-region** för PostgreSQL och inloggning; **Cloudflare Pages** för den statiska appen (`npm ci && npm run build`, publicera `dist/`). Det gör webbappen liten och flyttar synkjobben från iPaden till en server. Inga konton eller molnresurser har skapats, ingen app har publicerats och inga Supabase-anrop finns ännu i prototypen. Kontrollera aktuella priser, kvoter och tillgänglighetsvillkor innan drift.

Föreslagen datamodell: `families`, `family_members`, `people`, `calendar_sources`, `events` och `event_people`. Varje kalenderkälla och händelse ska tillhöra en familj. Supabase Auth hanterar vuxnas inloggning. Aktivera Row Level Security så att en inloggad användare bara kan läsa/ändra sin familjs uppgifter genom sitt medlemskap; barn ska inte behöva egna konton för att synas i kalendern. Privilegierade nycklar och externa kontouppgifter ska bara finnas på servern. Serverjobbet lagrar senaste synkstatus och uppdaterar händelser idempotent med källans UID och återkomst-id.

| Källa | Import i prototypen | Automatisk koppling som återstår |
| --- | --- | --- |
| Apple/iCloud | Exporterad ICS-fil | Serverhämtad kalenderprenumeration om sådan kan delas. Privat iCloud-koppling behöver separat autentisering/CalDAV-utredning. Publicera inte en privat familjekalender enbart för denna demo. |
| Outlook | Exporterad ICS-fil | Kalenderprenumeration om tillgänglig, alternativt Microsoft Graph med delegerad OAuth och minsta läsbehörighet. |
| InfoMentor | ICS-fil om skolan erbjuder export | Kontrollera skolans schematjänst och export/prenumerationsmöjligheter. InfoMentor-namnet i appen innebär inte att ett API är anslutet. |
| SportAdmin | ICS-fil om föreningen erbjuder export | Verifiera tillgänglig kalenderprenumeration och officiellt integrationsstöd. |
| Svenska Lag | ICS-fil om föreningen erbjuder export | Verifiera tillgänglig kalenderprenumeration och officiellt integrationsstöd. |

**Svar på kallelser:** ICS räcker inte för att bekräfta närvaro. Direkt svar i SportAdmin och Svenska Lag är inte implementerat och kräver verifierade, tillåtna API:er samt separat autentisering. Nu kan användaren öppna aktivitetens HTTPS-länk, om importen innehåller en sådan, och svara i källtjänsten. Appen visar inga falska ja/nej-knappar. Det återstår att kontrollera detta mot de faktiska tjänsterna och era föreningar.

För att gå från prototyp till delad vardagsapp behövs ett valt Supabase-projekt, inloggning och familjemedlemskap med testade åtkomstregler, samt tillgång till de faktiska kalenderexporterna/prenumerationerna. Därefter kan schemalagd synk, konflikthantering och säker cache införas. Serverbaserad synk ska inte lämna åtkomstlänkar, lösenord eller OAuth-token i webbläsarens lokala lagring.

Kalendertolkningen använder oförändrad [ical.js 2.2.1](https://github.com/mozilla-comm/ical.js/tree/v2.2.1), Mozilla Public License 2.0. Licenstexten följer med produktionsbygget som `ical.js.LICENSE.txt`. Övriga npm-paket används som utvecklingsverktyg.
