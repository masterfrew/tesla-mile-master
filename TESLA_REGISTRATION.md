# Tesla Account Registratie voor Europe Regio

## Overzicht

Om Tesla Fleet API te kunnen gebruiken in de Europe regio, moet je Tesla Developer account eerst worden geregistreerd voor die specifieke regio. Dit is een eenmalige setup stap die nodig is voordat gebruikers hun Tesla account kunnen verbinden.

## Waarom is dit nodig?

Tesla Fleet API vereist dat developer accounts expliciet worden geregistreerd per regio om:
- Correcte API routing te garanderen
- Regionale compliance te waarborgen  
- Security en billing per regio te beheren

## Registratie Proces

### Stap 1: Klik op "Registreer Tesla Account"

Op het dashboard zie je een knop "Registreer Tesla Account". Dit is de eerste stap voordat je Tesla kan verbinden.

### Stap 2: Account wordt automatisch geregistreerd

Het systeem:
1. Roept de Tesla Fleet API aan via de `tesla-register` Edge Function
2. Registreert je developer account (Client ID: `12bfe171-a438-4320-90ad-1a7002a83c34`) voor de Europe regio
3. Gebruikt het domein `kmtrack.nl` voor de registratie

### Stap 3: Verbind je Tesla

Na succesvolle registratie kun je de normale "Connect Tesla" flow gebruiken om je Tesla account te koppelen.

## Technical Details

### Edge Function: `tesla-register`

**Endpoint:** `https://hqpwepmdxzmuevalzkix.supabase.co/functions/v1/tesla-register`

**Authenticatie:** Vereist JWT (verify_jwt = true)

**Functionaliteit:**
- POST request naar `https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1/partner_accounts`
- Gebruikt Client ID en Client Secret voor authenticatie
- Registreert account met domein `kmtrack.nl`
- Handelt "already registered" errors gracefully af

**Response:**
```json
{
  "success": true,
  "message": "Tesla account successfully registered for Europe region",
  "alreadyRegistered": false
}
```

### API Details

**Tesla Fleet API Registratie Endpoint:**
```
POST https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1/partner_accounts
```

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <base64(client_id:client_secret)>
```

**Body:**
```json
{
  "domain": "kmtrack.nl"
}
```

## Troubleshooting

### Error: "Account already registered"
- Dit betekent dat het account al eerder is geregistreerd
- De applicatie handelt dit af als success
- Je kunt direct doorgaan naar het verbinden van je Tesla

### Error: "Tesla credentials not configured"
- Zorg dat `TESLA_CLIENT_ID` en `TESLA_CLIENT_SECRET` zijn ingesteld in Supabase secrets
- Check de Edge Function logs voor meer details

### Error: "Unauthorized"
- Zorg dat je bent ingelogd
- De JWT token is vereist voor deze functie
- Probeer uit te loggen en weer in te loggen

## Veiligheidsconsideraties

1. **JWT Required:** De registratie functie vereist authenticatie
2. **One-time Setup:** Hoeft maar 1x uitgevoerd te worden per developer account
3. **Automatic Handling:** De app detecteert automatisch of registratie al heeft plaatsgevonden
4. **Secure Credentials:** Client ID en Secret worden veilig opgeslagen in Supabase Vault

## Configuration

De functie is geconfigureerd in `supabase/config.toml`:

```toml
[functions.tesla-register]
verify_jwt = true
```

## Volgende Stappen

Na succesvolle registratie:
1. ✅ Account is geregistreerd voor Europe regio
2. 🔄 Klik op "Connect Tesla" of "Sync Tesla Data" 
3. 🚗 Autoriseer toegang in de Tesla OAuth flow
4. 📊 Jouw voertuigen en kilometerdata worden automatisch gesynchroniseerd
