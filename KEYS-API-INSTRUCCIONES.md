# API Keys — sin inicio de sesión

- `POST /api/keys/generar`: genera una key de 6 dígitos, sin body.
- `POST /api/keys/canjear`: recibe `{ "key": "000123", "usuarioId": "123456" }`. El canje es único.
- `GET /api/keys/listar?estado=generadas&page=1&limit=20`: historial sin contraseña.
- `GET /api/keys/resumen`: alias del historial.
- `/keys.html`: página para generar y canjear.
- `/keys-historial.html`: historial sin inicio de sesión.

Se conservan los límites de solicitudes al generar/canjear claves para evitar saturación. **Advertencia:** las keys son públicas y de solo seis dígitos; no las utilices para proteger pagos, cuentas o licencias. No hay privacidad para el historial de keys en un despliegue público.
