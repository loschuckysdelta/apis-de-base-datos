# LOS CHUCKYS — BOT APIS (Next.js 15 / MongoDB)

Proyecto revisado: panel de usuarios, contactos, baneados, membresías VIP, generación/canje de keys y comprobación de visita. Los datos de MongoDB **no** se incluyen ni modifican con este ZIP.

## Instalación local (Windows / PowerShell)

1. Extrae el ZIP; entra a `BOT-APIS-main`.
2. Abre **`.env.local`** (archivo, no carpeta) y configura `MONGODB_URI` con tu cadena de conexión de MongoDB Atlas. Se generaron claves aleatorias locales para los demás secretos; puedes reemplazarlas.
3. Ejecuta:

```powershell
npm ci
npm run dev
```

4. Entra a `http://localhost:3000/login.html` y usa la clave `ADMIN_PANEL_PASSWORD` de `.env.local`. La sesión se guarda en cookie `HttpOnly` durante 8 horas. No copies esa contraseña a JavaScript.

## Configuración en Vercel

En **Settings → Environment Variables** registra `MONGODB_URI`, `MONGODB_DB`, `ADMIN_PANEL_PASSWORD`, `ADMIN_SESSION_SECRET` y `API_ACCESS_KEY`. Copia los valores adecuados desde `.env.local` a tu configuración privada de Vercel o genera otros nuevos. Los archivos `.env.local` no se suben automáticamente a Vercel. Vuelve a desplegar tras configurar. **Nunca publiques claves o URIs de MongoDB en Git.**

`API_ACCESS_KEY`: clave de acceso para un bot o backend externo, usando encabezado `X-API-Key`. No agregar al navegador, aplicación móvil ni frontend. Un cliente anterior que llamaba rutas privadas sin este encabezado deberá actualizarse.

## Rutas principales

- Admin: `POST /api/admin/login` (JSON `{ "password": "..." }`), `GET /api/admin/session`, `POST /api/admin/logout`.
- Panel: `/login.html` y `/index.html`.
- Rutas **privadas** (sesión del panel o `X-API-Key` desde un backend): `/api/users`, `/api/contactos`, `/api/contactos/corregir`, `/api/baneados`, `/api/vip`, `/api/vip/links`, `/api/vip/activate`, `/api/vip/expire`, `/api/vip/renew`, `/api/stats`, `/api/health`.
- Keys: `POST /api/keys/generar` sin body; `POST /api/keys/canjear` JSON `{ "key": "000000", "usuarioId": "opcional" }`. **La generación es pública por compatibilidad** y solo tiene límite de solicitudes; no uses estas keys cortas como licencias pagadas.
- Historial de keys: `/api/keys/listar` y alias `/api/keys/resumen`, ahora **privados**. Aceptan la sesión del panel, la sesión antigua `/keys-acceso.html` o `X-API-Key`.
- Verificación de visita: `GET/POST /api/verificar` sigue pública y opcionalmente protegida por Turnstile. No confirma identidad. `GET /api/verificar/registros` exige sesión admin o secreto `VERIFICAR_ADMIN_SECRET`.

## Limpieza y reparaciones

- Eliminada la ruta obsoleta `/api/verificar/enlace` que importaba funciones inexistentes; no se usaba según README anterior.
- Corregida la página de keys para que coincida con la API de creación pública: cada POST genera un código nuevo.
- Añadida autorización al panel, VIP, baneos, importaciones y listados sensibles; reducido el acceso CORS.
- Respuestas de error privadas no filtran mensajes internos del servidor.
- Reparación masiva de contactos limitada a un tamaño prudente: si hay más de 20 000 registros, se detiene sin cambiar nada.
- `.gitignore` excluye `.env.local`, `.next`, `node_modules` y archivos temporales.

## Notas de seguridad

No existe garantía absoluta de cero fugas. Si tus credenciales antiguas se expusieron, **rótalas en MongoDB Atlas y Vercel**. Los secretos generados aquí son nuevos y no permiten recuperar las credenciales anteriores. Si se perdió la contraseña de Atlas, crea una nueva desde **Database Access** y actualiza `MONGODB_URI`.

`/api/verificar` registra una confirmación de visita con un ID proporcionado por el solicitante; **no demuestra que sea dueño del Telegram ID**. Para comprobar identidad, necesitas autenticación real. Si se usan keys para pagos, debe rediseñarse emisión y canje con códigos más fuertes y autenticación.
