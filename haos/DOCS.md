# Hemma familjekalender för HAOS

Lokalt tillägg för Home Assistant OS på amd64 eller aarch64 (exempelvis Home Assistant Green, Raspberry Pi med 64-bitars HAOS eller en vanlig x86-64-server). armv7 stöds inte av detta paket.

## Installation utan hostingavgift

1. Ladda ner och packa upp `hemma-haos.zip` på Macen.
2. Använd exempelvis det officiella tillägget **Samba share** för att komma åt HAOS-katalogen `addons`. Om Samba inte redan är installerat: installera det från Home Assistants butik och konfigurera användarnamn/lösenord enligt dess instruktioner. Serveradressen hittar du i dess logg.
3. På Macen: Finder → Gå → Anslut till server. Anslut till `smb://homeassistant.local` (eller serverns IP-adress). Öppna delningen `addons`.
4. Kopiera hela den uppackade mappen `hemma` till delningen, så att `/addons/hemma/config.yaml` finns på HAOS. Kopiera inte zip-filen eller bara mappen `app`.
5. I Home Assistant: Inställningar → Tillägg/Appar → Butik. Välj menyn ⋮ → Sök efter uppdateringar/ladda om. Under **Lokala tillägg** ska **Hemma familjekalender** visas.
6. Öppna tillägget och välj **Installera**. Första installationen bygger en container och hämtar Node/npm-paket; det kan ta flera minuter. Kontrollera loggen om bygget misslyckas.
7. Slå på **Starta vid uppstart** och **Visa i sidofältet**. Välj **Starta**, därefter **Öppna webbgränssnitt**.
8. Öppna kalendern genom Home Assistant på Macen och välj **Hantera kalenderkällor → Importera privat familjefil**. Välj den senaste privata JSON-filen som innehåller era länkar och veckoscheman. Den ingår inte i installationspaketet. Kontrollera synkstatus för varje källa.
9. På iPaden: öppna Home Assistant i Safari, logga in och välj **Familjekalender** i sidofältet. Macens kalenderprocess kan nu stoppas.

Anslutningar, servercache och veckoscheman sparas i `/data/connections.json` i tilläggets beständiga data. Starta om tillägget och bekräfta att kalendrarna är kvar. Ta med tilläggets data i Home Assistants säkerhetskopior. Färgval, filter och manuellt skapade aktiviteter sparas fortfarande per webbläsare.

## Åtkomst

Tillägget använder **Ingress**, alltså Home Assistants befintliga inloggning. Ingen separat publik kalenderport, portvidarebefordran, Supervisor API-behörighet eller Home Assistant API-token behövs. Anslutningar får hanteras genom Ingress-proxyn på 172.30.32.2. Förfalskade Ingress-headers från andra adresser godkänns inte. Öppna via Home Assistant, inte direkt mot containerporten.

Servern är alltid igång när HAOS-servern och tillägget körs. Kalenderhämtning sker vid start och var 15:e minut; varje iPad läser serverns cache. För användning hemma behövs inget betalt abonnemang eller molnserver. Åtkomst utanför hemmet beror på hur du redan når Home Assistant och ingår inte i installationen. Alla som kan öppna tillägget via din HA-installation kan hantera familjens kalenderanslutningar; det finns ingen extra rollhantering i kalendern.

Programmet byggs för Safari 15, men Home Assistants eget gränssnitt har separata webbläsarkrav. Hela flödet måste därför provas på den faktiska iPad Air 2-enheten. Helskärm inne i Ingress fyller kalenderns ram; Home Assistants egna menyer kan behöva döljas separat.

## Uppdatera

Behåll `/data` och ersätt filerna i `/addons/hemma` med ett nytt paket. Använd tilläggets **Bygg om/Rebuild** för att bygga den nya koden, och starta om. Avinstallera inte tillägget för en vanlig uppdatering: avinstallation kan radera dess data. För att återgå, lägg tillbaka föregående kodpaket och bygg om, eller återställ HA-säkerhetskopian.

## Utveckling

Paketet skapas från projektroten med `npm run addon:package`. Endast en uttrycklig lista med programfiler kopieras till `dist/haos/hemma`. Privata familjefiler, `.local`, PDF:er, `.git` och utvecklingsmaskinens `node_modules` ingår inte. Dockerbygget kör `npm ci`, bygger gränssnittet och tar bort utvecklingsberoenden från runtime.

## Verifiering av detta paket

Containerbygget och en runtime på amd64 är testade. Ingress simulerades med proxyadressen 172.30.32.2; testerna kontrollerade HTML-basväg, API-läsning, importskrivning och beständiga data efter containeromstart. 27 enhetstester och 13 webbläsartester passerade. Byggmiljöns eget CA-certifikat monterades tillfälligt som en bygghemlighet för npm:s TLS-verifiering; det ingår inte i paketet eller runtime. TLS-verifiering var aktiverad. Faktisk HAOS-installation, aarch64-körning och iPad Air 2 har ännu inte verifierats.
