# VIP Telegram — sin inicio de sesión

Las rutas `/api/vip`, `/api/vip/links`, `/api/vip/links/[token]`, `/api/vip/activate`, `/api/vip/renew` y `/api/vip/expire` no requieren contraseña, sesión ni encabezado `X-API-Key`.

Ejemplo para tu bot Python:

```python
import requests
url = 'https://TU-PROYECTO.vercel.app/api/vip'
r = requests.get(url, timeout=15)
r.raise_for_status()
print(r.json())
```

Solo necesitas la URI válida de MongoDB en el servidor. Este backend administra registros de VIP en MongoDB: no crea invitaciones reales de Telegram ni expulsa usuarios. **Advertencia:** cualquiera que acceda a las rutas públicas podrá consultar o modificar membresías.
