# API de confirmación /api/verificar — SIN TOKEN DE TELEGRAM

**Se eliminó el requisito `token` de Telegram y la ruta `/api/verificar/enlace`.** Esta API usa la conexión MongoDB que ya tiene el proyecto y no cambia `/api/users` ni VIP. La API de keys está disponible por separado; consulta KEYS-API-INSTRUCCIONES.md.

## 1. Solicitudes públicas (sin bot y sin token)

### POST /api/verificar

```http
POST https://bot-apis-zkmk.vercel.app/api/verificar
Content-Type: application/json
```

```json
{"telegramId":"123456789"}
```

Si el usuario existe en la colección `users` y no está bloqueado, registra la confirmación durante 24 horas.

Respuesta de ejemplo:

```json
{
  "success":true,
  "telegramId":"123456789",
  "verificado":true,
  "estado":"activo",
  "verificadoEn":"2026-11-07T17:00:00.000Z",
  "expiraEn":"2026-11-08T17:00:00.000Z",
  "mensaje":"Confirmación registrada correctamente"
}
```

### GET /api/verificar?telegramId=123456789

Devuelve el estado (activo o no_verificado) sin generar registros. Si está vencido, `verificado:false`, aunque MongoDB todavía no haya limpiado físicamente el documento.

### GET /api/verificar/registros (sin login)

Devuelve el listado de verificaciones sin contraseña ni sesión de administrador.

## 2. Variables de entorno

Solo se requieren `MONGODB_URI` y `MONGODB_DB`. La verificación dura 24 horas por defecto (no necesita CAPTCHA, clave ni contraseña del panel).

## 3. Tu página key.html

Abre `https://loschuckys.com/key.html?id=123456789`. El HTML de ejemplo que acompaña al ZIP:

1. Consulta `/api/users?buscar=123456789` y muestra Nombre, Telegram ID y Usuario.
2. Consulta `GET /api/verificar?telegramId=123456789` para mostrar si ya está activo.
3. Al pulsar «Confirmar visita» muestra una barra durante un mínimo de 5 segundos y envía `POST /api/verificar` con solo `telegramId`.
4. Muestra una marca verde SOLO si la API respondió `verificado:true`.
5. La confirmación dura 24 horas y puede repetirse al vencer. No se renueva con clics continuos.

## 4. Límites y caducidad

- Máximo **8 POST por ID Telegram** en cada ventana de 15 minutos.
- Máximo **40 POST por IP** en cada ventana de 15 minutos cuando el proxy facilita la IP (control complementario, no infalible).
- Se devuelven HTTP 429 y `Retry-After` al excederse.
- MongoDB tiene índices TTL en `verificaciones.expiraEn` y `verificacion_intentos.eliminarEn`.
- El estado se considera vencido inmediatamente cuando pasa la fecha, sin depender del proceso de limpieza de MongoDB.

## 5. Límite importante de seguridad

**Un ID en la URL NO demuestra que la visita la hizo el dueño de ese Telegram.** Sin token, login u otra prueba de identidad, cualquier persona puede copiar o alterar un ID. Por tanto, el estado de esta versión significa que **se registró una confirmación para ese ID**, no que se autenticó a su propietario. Esta versión no verifica la identidad real del propietario. No hay CAPTCHA en esta versión.

## 6. Despliegue

Despliega en Vercel como siempre. En el panel de APIs el ejemplo del POST ya no muestra token. Esta versión mantiene las otras APIs y elimina los ejemplos y las rutas anteriores de emisión de tokens.



