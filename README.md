# Trading

Herramienta personal para aprender trading: gráfico en vivo de Binance, análisis automático de los últimos 2 meses (con probabilidades según el histórico) y un simulador con dinero ficticio. Responsiva para el iPhone e instalable como app (PWA).

- **Stack:** Next.js 16 · React 19 · Tailwind 4 · lightweight-charts 5 · Auth.js (Google)
- **Node** 24.21.0 · **Yarn** 4
- La versión HTML original está en [legacy-html/](legacy-html/).

## Desarrollo

```bash
cp .env.example .env.local   # y completa los valores
yarn install
yarn dev                     # http://localhost:3000
```

Mientras no tengas las credenciales de Google, pon `AUTH_DISABLED=true` en `.env.local` para saltar el login. **Solo funciona en desarrollo**: en producción el login siempre es obligatorio.

## Estructura

| Carpeta | Qué hay |
|---|---|
| `lib/binance.ts` | Rutas públicas de Binance (velas, precio 24h, WebSocket) |
| `lib/indicators.ts` | Medias móviles y cálculos simples |
| `lib/analysis.ts` | Las reglas del análisis y las probabilidades |
| `components/price-chart.tsx` | Gráfico + cuadros y columna de probabilidades dibujados encima |
| `components/analysis-sheet.tsx` | La ventana con el análisis en palabras |
| `components/simulator.tsx` | Simulador (por ahora se guarda en el navegador) |
| `auth.ts` · `proxy.ts` | Login con Google, solo para los correos de `ALLOWED_EMAILS` |

## Login con Google (una sola vez)

1. Entra a [console.cloud.google.com](https://console.cloud.google.com) y crea un proyecto (por ejemplo "trading").
2. **APIs y servicios → Pantalla de consentimiento de OAuth**: tipo *Externo*, pon tu correo y agrégate como *usuario de prueba*.
3. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**
   - Tipo: *Aplicación web*
   - URI de redirección autorizados:
     - `https://trading.luminia.com.bo/api/auth/callback/google`
     - `http://localhost:3000/api/auth/callback/google`
4. Copia el *ID de cliente* y el *Secreto* a `AUTH_GOOGLE_ID` y `AUTH_GOOGLE_SECRET`.
5. Genera `AUTH_SECRET` con `openssl rand -base64 32`.

## Subir al Synology

### Opción A: compilar en el NAS (la más simple)

1. Copia la carpeta del proyecto al NAS (por ejemplo `/volume1/docker/trading`), **sin** `node_modules` ni `.next`.
2. Crea ahí el archivo `.env` (copia de `.env.example`) con los valores de producción y `AUTH_DISABLED=false`.
3. **Container Manager → Proyecto → Crear**: elige esa carpeta; detecta el `docker-compose.yml`. Dale a *Compilar* e *Iniciar*.

   O por SSH: `cd /volume1/docker/trading && sudo docker compose up -d --build`

La primera compilación puede tardar unos minutos si el NAS es modesto.

### Opción B: compilar en la Mac y subir la imagen

Útil si el NAS es lento. Primero revisa el procesador del NAS: la mayoría son Intel/AMD (`linux/amd64`), pero algunos modelos "j" son ARM (`linux/arm64`).

```bash
docker buildx build --platform linux/amd64 -t trading:latest --load .
docker save trading:latest | gzip > trading.tar.gz
# Container Manager → Imagen → Importar → trading.tar.gz
# y en el NAS: docker compose up -d   (sin --build)
```

### Subdominio (Cloudflare Tunnel)

El contenedor se llama `trading-luminia` y está en la red `luminia_default`, la misma que usa el túnel. En **Cloudflare → Zero Trust → Networks → Tunnels → Routes → Add published application**:

- Subdominio: `trading` · Dominio: `luminia.com.bo`
- Service URL: `http://trading-luminia:4300`

Cloudflare se encarga del HTTPS.

## En el iPhone

Abre `https://trading.luminia.com.bo` en Safari → botón *Compartir* → **Agregar a pantalla de inicio**. Se abre en pantalla completa, como una app.

## Aviso

Proyecto personal de aprendizaje. El análisis usa reglas simples y estadísticas del pasado: **no es una predicción ni un consejo financiero**. Los datos vienen de las rutas públicas de Binance.
