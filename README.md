# LOS CHUCKYS — BOT APIS, PANEL SIN LOGIN

Panel directo: no requiere contraseña, inicio de sesión, cookies administrativas ni API keys para acceder a rutas administrativas. Esta versión mantiene las funciones de usuarios, contactos, VIP, keys y verificación. No se modifica la base de datos con el ZIP.

## Configuración

1. En `.env.local` escribe la cadena completa `MONGODB_URI` que facilita MongoDB Atlas en **Connect > Drivers**, con usuario y contraseña **de MongoDB Atlas** (solo para conectar al servidor). **No es una contraseña del panel**.
2. `MONGODB_DB=bot_apis` si ese es el nombre de tu base de datos.
3. Instala dependencias y arranca:

```powershell
npm ci
npm run dev
```

4. Entra a `http://localhost:3000/` o `http://localhost:3000/index.html`. No hay login. El historial se abre en `/keys-historial.html`.

### Vercel

Configura las variables **MONGODB_URI** y **MONGODB_DB** en **Settings > Environment Variables** y realiza un *Redeploy*. El `.env.local` de tu PC no se transmite a Vercel. `TU_CLUSTER` es un marcador: debes poner la dirección completa de Atlas. Si la cadena de conexión no es válida, el panel se abre, pero los datos no se cargarán.

### Rutas principales

- Panel: `/` y `/index.html` (acceso directo).
- Historial: `/keys-historial.html` (acceso directo).
- API: `/api/users`, `/api/contactos`, `/api/baneados`, `/api/vip`, `/api/keys/generar`, `/api/keys/canjear`, `/api/keys/listar`, `/api/health` y demás rutas del proyecto. No requieren contraseña del panel.
- Las operaciones mantienen validaciones de datos y algunos límites antiabuso para claves.

### Advertencia

**No existe ningún control de acceso para administrar los datos.** Cualquiera que conozca la URL de un despliegue público podrá consultar, modificar o eliminar registros mediante la API, incluida información de contactos, VIP y keys. Si quieres evitarlo sin contraseñas, restringe el acceso por red o mantén el panel en un entorno privado. Nunca incluyas `.env.local` en GitHub: contiene la contraseña de la conexión a MongoDB.
