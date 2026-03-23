# BASKET FLOW — PROMPT COMPLETO PARA ANTIGRAVITY
## Sistema de Gestión de Operaciones de Báscula y Mercancía

---

## 1. IDENTIDAD DEL SISTEMA

**Nombre:** Basket Flow
**Industria:** Distribución y recepción de frutas y verduras (Fresh Produce)
**Operación:** Control de entrada de mercancía, devoluciones, inventario de canasillas y trazabilidad de operaciones de báscula.
**Usuarios:** Operadores de báscula, supervisores, administradores. Operan desde computadores de escritorio en bodega y oficina.

---

## 2. DIRECCIÓN ESTÉTICA — FUTURISTA INDUSTRIAL

**Concepto visual:** "Terminal de control de una planta de operaciones de alta precisión."
Imagina la sala de control de un puerto de carga moderno mezclada con la UI de un software de telemetría industrial. No es ciencia ficción, es tecnología real que inspira confianza operativa.

**Estética:**
- Dark mode absoluto. Fondo casi negro con sutiles capas de profundidad (bg #080C10 → #0D1319 → #111820)
- Grid de puntos o líneas muy sutiles como textura de fondo (opacidad 3-4%)
- Acento principal: Cian eléctrico `#00D2B4` — para elementos activos, bordes de foco, badges de estado OK
- Acento secundario: Ámbar/dorado `#F0C060` — para alertas, métricas destacadas, stock bajo
- Peligro: Rojo coral `#FF4D6A` — alertas críticas, stock negativo, sesiones expiradas
- Tipografía display: **Syne** (800 para títulos, 600 para labels de sección) — geométrica, fuerte, sin serif
- Tipografía mono: **DM Mono** — para consecutivos, fechas, pesos, cantidades, IDs. Todo número vive en mono.
- Tipografía cuerpo: **Syne** regular 400 para texto general
- Bordes: 1px sólido con opacidad baja (rgba cian 12-25%), sin border-radius exagerado — máximo 8px en cards, 4px en inputs
- Sin gradientes decorativos. Sin sombras borrosas. Sin glassmorphism genérico.
- Micro-animaciones de entrada: stagger fade + translate-Y al cargar cada sección (100ms de delay entre elementos)
- Hover states: borde cian intensificado + fondo cian muy tenue (8% opacidad)
- Cursores personalizados opcionales para el área de la báscula (crosshair o punto cian)

**Lo que hace UNFORGETTABLE a Basket Flow:**
Los números de peso en DM Mono tamaño grande (48-64px) con color cian brillante en el formulario de entrada — como la pantalla de una báscula real digitalizada. Cada vez que el operador registra un peso, parece que está mirando el display de un equipo de precisión.

---

## 3. STACK TECNOLÓGICO

```
Frontend:    HTML5 + CSS3 + Vanilla JavaScript (sin frameworks)
Backend:     Google Apps Script (GAS) — doGet / doPost como API REST
Base datos:  Google Sheets (estructurada como base de datos relacional)
Auth:        Sistema propio en Sheets — email + contraseña (hash SHA-256)
             JWT-like token almacenado en localStorage con expiración configurable
PDF:         jsPDF + jsPDF-AutoTable (CDN) generado en cliente
Fuentes:     Google Fonts (Syne + DM Mono)
Iconos:      Lucide Icons (CDN, SVG inline)
```

**Arquitectura GAS:**
- Un único Web App publicado como "Ejecutar como yo, accesible para cualquier usuario"
- `doGet(e)` sirve el HTML de la SPA
- `doPost(e)` recibe JSON con `{action, payload, token}` y despacha a funciones
- Todas las respuestas GAS: `ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON)`

---

## 4. MÓDULO DE AUTENTICACIÓN

### 4.1 Pantalla de Login

**Diseño:**
- Pantalla completa dividida: lado izquierdo 45% con el logotipo Basket Flow animado (SVG animado con líneas de flujo que representan canasillas moviéndose), lado derecho 55% con el formulario
- Logo: ícono de canasilla estilizada + texto "BASKET FLOW" en Syne 800, letra-spacing 0.15em, color cian
- Tagline debajo: _"Operaciones bajo control. Siempre."_ en Syne 400, color text2
- El fondo izquierdo tiene el grid de puntos más pronunciado y un orbe de luz cian radial muy suave

**Formulario:**
```
[ Email corporativo        ]
[ Contraseña          👁  ]
[ ☐ Mantener sesión abierta ]
[ INICIAR SESIÓN           ]
```

- Input de email con validación en tiempo real (borde cian si válido, rojo si no)
- Toggle de contraseña visible/oculta
- Checkbox "Mantener sesión abierta" — si marcado, el token dura 30 días; si no, dura 8 horas (tiempo de turno)
- Botón principal: fondo cian, texto negro, Syne 700, uppercase, letra-spacing 0.1em
- Al hacer click: el botón muestra spinner cian y texto "AUTENTICANDO..." antes de responder
- Si error: shake animation en el formulario + mensaje de error inline en rojo con ícono

**Mensajes de error:**
- Credenciales incorrectas: "Credenciales inválidas. Verifica tu email y contraseña."
- Usuario inactivo: "Tu cuenta está desactivada. Contacta al administrador."
- Sin conexión GAS: "No se pudo conectar con el servidor. Intenta de nuevo."

### 4.2 Sistema de Sesión

```javascript
// Estructura del token en localStorage
{
  "token": "bf_[userId]_[timestamp]_[hash]",
  "userId": "usr_001",
  "name": "Yecy Jimenez",
  "role": "operador",       // admin | supervisor | operador | readonly
  "permissions": ["entradas.crear", "entradas.ver", "canasillas.ver"],
  "expires": 1740000000000, // timestamp Unix ms
  "keepAlive": true
}
```

- Cada petición a GAS incluye el token en el body JSON
- GAS valida el token contra la hoja `Usuarios` antes de ejecutar cualquier acción
- Si token expirado: frontend redirige al login con mensaje "Tu sesión ha expirado."
- El token se refresca automáticamente en cada petición exitosa (sliding expiration)
- `keepAlive: true` → extiende 30 días en cada request. `false` → extiende 8 horas.

### 4.3 Roles y Permisos

| Permiso | Admin | Supervisor | Operador | Solo Lectura |
|---|---|---|---|---|
| Crear entradas | ✅ | ✅ | ✅ | ❌ |
| Editar entradas (propias, mismo día) | ✅ | ✅ | ✅ | ❌ |
| Anular entradas | ✅ | ✅ | ❌ | ❌ |
| Ver todas las entradas | ✅ | ✅ | Solo propias | ✅ |
| Crear devoluciones | ✅ | ✅ | ✅ | ❌ |
| Aprobar devoluciones | ✅ | ✅ | ❌ | ❌ |
| Control canasillas | ✅ | ✅ | Ver + mover | ✅ |
| Reportes completos | ✅ | ✅ | Solo diario | ❌ |
| Exportar PDF/Excel | ✅ | ✅ | Solo propio | ❌ |
| Maestros (CRUD) | ✅ | ❌ | ❌ | ❌ |
| Gestión de usuarios | ✅ | ❌ | ❌ | ❌ |
| Ver log de actividad | ✅ | ✅ | ❌ | ❌ |

---

## 5. ESTRUCTURA DE MÓDULOS

### MÓDULO 1 — DASHBOARD PRINCIPAL

**Layout:** Topbar fija + Sidebar izquierda 220px + Área de contenido principal

**Topbar contiene:**
- Logo Basket Flow izquierda
- Breadcrumb de navegación actual (fuente mono, pequeña)
- Reloj en tiempo real (fuente mono, actualiza cada segundo)
- Notificaciones (campana con badge rojo si hay alertas)
- Avatar + nombre + rol del usuario logueado → click abre menú con Perfil y Cerrar sesión

**Sidebar contiene:**
```
OPERACIONES
  ↳ Dashboard
  ↳ Nueva Entrada         [icono: package-plus]
  ↳ Registro de Entradas  [icono: list]
  ↳ Devoluciones          [icono: package-x]

INVENTARIO
  ↳ Canasillas            [icono: archive] [badge: alertas]

REPORTES
  ↳ Reportes Diarios      [icono: bar-chart]
  ↳ Generador PDF         [icono: file-text]

CONFIGURACIÓN (solo Admin)
  ↳ Maestros              [icono: database]
  ↳ Usuarios              [icono: users]
  ↳ Log de Actividad      [icono: activity]
```

**Área principal del Dashboard:**
- Fila de KPIs del día: Entradas del día / Kg totales recibidos / Canasillas en circulación / Alertas activas
- Mini gráfica de barras de entradas por hora (últimas 8 horas)
- Tabla de las últimas 5 entradas del día con estado
- Panel de alertas de canasillas (las que llevan más de 7 días fuera)
- Acceso rápido: botón grande "REGISTRAR ENTRADA" con animación de pulso suave

---

### MÓDULO 2 — NUEVA ENTRADA DE MERCANCÍA

**Concepto visual:** El centro de la pantalla muestra el peso calculado en un display estilo báscula digital — números grandes en DM Mono cian, que se actualizan en tiempo real al cambiar los inputs.

**Formulario en dos columnas + panel de resultado:**

**Columna izquierda — Identificación:**
```
Consecutivo:    [ BF-2026-15379 ] (auto, readonly, mono, cian)
Fecha y hora:   [ 22/03/2026  23:10:05 ] (auto, readonly)
Proveedor:      [ Select buscable con autocomplete ]
Producto:       [ Select buscable ]
Cliente destino:[ Select buscable — puede ser vacío "Sin cliente" ]
Comentarios:    [ Textarea — observaciones de calidad, temperatura, etc. ]
```

**Columna derecha — Pesos y Canasillas:**
```
Peso total báscula (kg): [ input numérico — grande, prominente ]
Peso estiba:             [ Select: Sin estiba / 0.5 / 1 / 1.5 kg ]

─── CANASILLAS ───────────────────────────
Tipo 1: [Propietario ▼] [Peso unit ▼] [Cantidad] [subtotal = auto]
Tipo 2: [Propietario ▼] [Peso unit ▼] [Cantidad] [subtotal = auto]
Tipo 3: [Propietario ▼] [Peso unit ▼] [Cantidad] [subtotal = auto]
[ + Agregar tipo ]
```

**Panel central — Display de báscula (el elemento unforgettable):**
```
┌─────────────────────────────────┐
│  PESO LIBRE (MERCANCÍA)         │
│                                 │
│        17.0 kg                  │  ← 64px DM Mono cian brillante
│                                 │
│  Canasillas: 3.0 kg             │  ← 16px mono amber
│  Estiba:     0.0 kg             │
│  Total can.: 2 uds              │
└─────────────────────────────────┘
```

Este panel se actualiza instantáneamente (sin submit) con cada keystroke en los inputs de peso y cantidad. Si el peso libre es negativo → se pone rojo y muestra "ERROR: peso inválido".

**Botones de acción:**
- `GUARDAR ENTRADA` — primario, cian, ancho completo. Deshabilitado si hay errores de validación.
- `LIMPIAR` — secundario, ghost
- Al guardar: animación de éxito (check verde animado) → la entrada aparece en el registro → formulario se limpia listo para siguiente operación

**Validaciones:**
- Proveedor y producto son obligatorios
- Peso báscula > 0
- Peso báscula debe ser ≥ suma de canasillas + estiba
- Al menos una línea de canasillas con cantidad > 0
- Muestra errores inline bajo cada campo, en rojo, con texto descriptivo

---

### MÓDULO 3 — REGISTRO DE ENTRADAS (GRILLA TIPO ODOO)

**Concepto:** Grilla de datos profesional, densa pero legible, con búsqueda y filtros potentes. Similar a la vista de lista de Odoo.

**Barra superior de la grilla:**
```
[ 🔍 Buscar por consecutivo, proveedor, producto... ]
[ Proveedor ▼ ] [ Producto ▼ ] [ Cliente ▼ ] [ Estado ▼ ]
[ 📅 Desde ] [ 📅 Hasta ]                    [ Exportar Excel ] [ Exportar PDF ]
```

**Columnas de la grilla:**
| # | Consecutivo | Fecha | Hora | Proveedor | Producto | Cliente | Peso Báscula | Peso Libre | Canasillas | Registró | Estado | Acciones |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ☐ | BF-2026-15379 | 22/03/26 | 23:10 | Adriana R. | Aguacate Hass | D1 | 20.0 kg | 17.0 kg | 2 uds | Yecy J. | ● Activa | 👁 📄 ✏ |

**Comportamiento de la grilla:**
- Paginación: 25 / 50 / 100 filas por página
- Click en fila → abre panel lateral (drawer) con el detalle completo de la entrada
- Checkbox múltiple → seleccionar varias entradas → acción en lote (exportar PDF de selección, anular)
- Click en ícono 👁 → modal de detalle completo (solo lectura)
- Click en ícono 📄 → genera PDF de esa entrada directamente
- Click en ✏ → edición (solo si el usuario tiene permiso y es el mismo día)
- Columnas ordenables por click en el header (asc/desc con indicador de flecha)
- Búsqueda en tiempo real (debounce 300ms) contra GAS

**Estados de entrada:**
- `● Activa` — verde cian
- `⚠ Con devolución` — ámbar
- `✗ Anulada` — rojo tachado
- `⏳ Pendiente revisión` — gris pulsante

---

### MÓDULO 4 — DEVOLUCIONES

**Flujo:**
1. Buscar la entrada original (por consecutivo o desde la grilla)
2. La entrada se carga con sus datos. El operador indica:
   - Motivo de devolución (select + campo texto)
   - Peso devuelto (kg)
   - Canasillas que retornan (cantidad y propietario)
3. El sistema calcula automáticamente el impacto:
   - Nuevo peso neto = peso original - peso devuelto
   - Stock de canasillas se ajusta si retornan canasillas
4. Requiere aprobación de Supervisor/Admin para quedar procesada
5. Genera un consecutivo propio: `DEV-2026-0041`

**Estados de devolución:**
- Borrador → Pendiente aprobación → Aprobada → Rechazada

---

### MÓDULO 5 — CONTROL DE CANASILLAS (INVENTARIO)

**KPIs en la parte superior:**
```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Stock Empresa│ │ Con Clientes │ │ Con Proveed. │ │ ⚠ En alerta  │
│     347      │ │      84      │ │      56      │ │      23      │
│  +12 hoy     │ │  8 activos   │ │  4 proveed.  │ │  >7 días     │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

**Grilla de stock por propietario:**
Muestra saldo actual de cada tipo de canasilla (por propietario + peso unitario).

**Log de movimientos:**
Igual que la grilla de entradas — buscable, filtrable, con export.
Cada movimiento tiene: tipo (Entrada / Salida / Retorno / Ajuste), propietario, cantidad, referencia a entrada/devolución, usuario, fecha/hora.

**Alertas automáticas:**
- Canasillas de empresa con cliente > 7 días → badge rojo en sidebar + fila resaltada
- Stock de empresa < umbral configurado → alerta en dashboard

**Registro de ajuste manual:**
Solo Admin puede crear ajustes manuales de inventario (con motivo obligatorio).

---

### MÓDULO 6 — GENERADOR DE PDF

**PDFs que puede generar el sistema:**

**PDF de Entrada individual:**
```
┌─────────────────────────────────────────┐
│  🧺 BASKET FLOW                         │
│  Registro de Entrada — BF-2026-15379    │
│  22 de marzo de 2026 · 23:10:05        │
├─────────────────────────────────────────┤
│  PROVEEDOR: Adriana Maria Ramirez Serna │
│  PRODUCTO:  Aguacate Hass               │
│  CLIENTE:   D1                          │
├─────────────────────────────────────────┤
│  Peso total báscula:    20.0 kg         │
│  Peso canasillas:        3.0 kg         │
│  Peso estiba:            0.0 kg         │
│  PESO LIBRE (NETO):     17.0 kg  ←bold │
├─────────────────────────────────────────┤
│  CANASILLAS                             │
│  Propietario  Peso unit  Cant  Subtotal │
│  Empresa      1.5 kg      2    3.0 kg   │
├─────────────────────────────────────────┤
│  Registrado por: Yecy Jimenez           │
│  Hora de registro: 23:10:05             │
│  [Espacio para firma]                   │
└─────────────────────────────────────────┘
```

**PDF de Reporte diario:**
- Resumen del día: total entradas, kg totales, proveedores, clientes
- Tabla con todas las entradas del día
- Totales por producto y por proveedor
- Firma del supervisor

**PDF de Inventario de canasillas:**
- Saldo por propietario al momento de la generación
- Lista de canasillas en alerta (> días configurados)

**PDF de Devolución:**
- Datos de la devolución + entrada original referenciada + firmas

**Tecnología:** `jsPDF` + `jsPDF-AutoTable` via CDN. Todo generado en el cliente (sin servidor). El header del PDF incluye el logo de Basket Flow en SVG convertido a base64.

---

### MÓDULO 7 — LOG DE ACTIVIDAD (Solo Admin/Supervisor)

**Cada acción del sistema genera un registro inmutable en la hoja `LogActividad`:**

```
Timestamp | Usuario | Rol | Acción | Módulo | Referencia | IP/UserAgent | Resultado
```

**Acciones registradas:**
- Login exitoso / Login fallido
- Creación / edición / anulación de entradas
- Creación / aprobación / rechazo de devoluciones
- Movimientos de canasillas
- Ajustes manuales de inventario
- Exportación de reportes
- Cambios en maestros
- Cambios en usuarios
- Cambios de contraseña

**Grilla del log:**
Igual que las otras grillas — buscable, filtrable por usuario, módulo, acción y rango de fechas. Solo lectura, no editable por nadie. Solo Admin puede verlo. Permite exportar a Excel para auditorías.

---

### MÓDULO 8 — MAESTROS (Solo Admin)

Gestión de catálogos del sistema. Cada uno con su propia grilla + formulario de creación/edición:

- **Proveedores:** Nombre, documento, teléfono, email, activo/inactivo
- **Clientes:** Nombre, documento, tipo (mayorista/minorista/plataforma), contacto, activo/inactivo
- **Productos:** Nombre, unidad de medida, categoría, activo/inactivo
- **Tipos de canasilla:** Descripción, peso unitario (kg), activo/inactivo
- **Configuración general:** Días de alerta de canasillas, turnos del día, logo de empresa para PDFs

---

### MÓDULO 9 — GESTIÓN DE USUARIOS (Solo Admin)

**Grilla de usuarios** con: nombre, email, rol, estado (activo/inactivo), último acceso, sesiones activas.

**Formulario de usuario:**
```
Nombre completo:    [___________]
Email:              [___________]  ← usado para login
Contraseña:         [___________]  ← solo al crear; después se usa "Resetear"
Confirmar ctra.:    [___________]
Rol:                [ Select: Admin | Supervisor | Operador | Solo Lectura ]
Estado:             [ ● Activo  ○ Inactivo ]
```

**Acciones:**
- Crear nuevo usuario
- Editar nombre y rol
- Activar / desactivar cuenta
- Resetear contraseña → genera contraseña temporal y la muestra UNA sola vez
- Ver historial de accesos del usuario

**Seguridad:**
- Las contraseñas se almacenan en Sheets como hash SHA-256 (nunca en texto plano)
- El Admin no puede ver contraseñas, solo resetearlas
- Un usuario no puede desactivarse a sí mismo

---

## 6. ESTRUCTURA DE GOOGLE SHEETS

```
📊 BasketFlow_DB (Google Sheets)
│
├── 📄 Entradas
│   Consecutivo | FechaHora | ProveedorID | ProductoID | ClienteID |
│   PesoBascula | PesoEstiba | PesoCanasillas | PesoLibre |
│   UsuarioID | Estado | Comentarios | FechaCreacion | FechaModif
│
├── 📄 LineasCanasillasEntrada
│   EntradaID | PropietarioTipo | PropietarioID | PesoUnitario |
│   Cantidad | PesoSubtotal
│
├── 📄 Devoluciones
│   Consecutivo | EntradaRef | FechaHora | Motivo | PesoDevuelto |
│   UsuarioID | Estado | AprobadoPor | FechaAprobacion
│
├── 📄 LineasCanasillasDevolucion
│   DevolucionID | PropietarioTipo | PropietarioID | Cantidad
│
├── 📄 StockCanasillas
│   PropietarioTipo | PropietarioID | PesoUnitario | StockActual |
│   UltimaActualizacion
│
├── 📄 MovimientosCanasillas
│   ID | FechaHora | Tipo | PropietarioTipo | PropietarioID |
│   PesoUnitario | Cantidad | ReferenciaDoc | UsuarioID | Notas
│
├── 📄 Usuarios
│   ID | Nombre | Email | PasswordHash | Rol | Activo |
│   UltimoAcceso | FechaCreacion
│
├── 📄 Sesiones
│   Token | UsuarioID | FechaCreacion | FechaExpiracion |
│   KeepAlive | Activa
│
├── 📄 LogActividad
│   ID | Timestamp | UsuarioID | Rol | Accion | Modulo |
│   Referencia | Detalle | Resultado
│
├── 📄 Proveedores
│   ID | Nombre | Documento | Telefono | Email | Activo
│
├── 📄 Clientes
│   ID | Nombre | Documento | Tipo | Contacto | Activo
│
├── 📄 Productos
│   ID | Nombre | UnidadMedida | Categoria | Activo
│
└── 📄 TiposCanasilla
    ID | Descripcion | PesoUnitario | Activo
```

---

## 7. ESTRUCTURA DE ARCHIVOS DEL PROYECTO

```
basket-flow/
│
├── index.html              ← SPA principal (servida por GAS doGet)
├── css/
│   ├── reset.css
│   ├── variables.css       ← todos los tokens de diseño
│   ├── layout.css          ← shell, sidebar, topbar
│   ├── components.css      ← inputs, botones, grilla, badges, modales
│   └── modules.css         ← estilos específicos de cada módulo
│
├── js/
│   ├── app.js              ← router SPA, inicialización
│   ├── auth.js             ← login, token, sesión, permisos
│   ├── api.js              ← cliente HTTP para GAS (fetch wrapper)
│   ├── utils.js            ← formateo de fechas, números, validaciones
│   ├── pdf.js              ← generación de PDFs con jsPDF
│   └── modules/
│       ├── dashboard.js
│       ├── entradas.js
│       ├── devoluciones.js
│       ├── canasillas.js
│       ├── reportes.js
│       ├── log.js
│       ├── maestros.js
│       └── usuarios.js
│
└── gas/                    ← Google Apps Script
    ├── Code.gs             ← doGet / doPost dispatcher
    ├── Auth.gs             ← validación de tokens, login
    ├── Entradas.gs         ← CRUD de entradas
    ├── Devoluciones.gs
    ├── Canasillas.gs       ← movimientos y stock
    ├── Reportes.gs
    ├── Maestros.gs
    ├── Usuarios.gs
    └── Log.gs              ← escritura del log de actividad
```

---

## 8. FUNCIONES SUGERIDAS — VALOR AÑADIDO

### 8.1 Operativas (alto impacto inmediato)

**📊 Dashboard de turno:**
Al iniciar sesión, el operador ve un resumen de lo que ha hecho en su turno actual: entradas registradas, kg procesados, canasillas movidas. Motivador y útil para el supervisor.

**🔁 Duplicar entrada:**
Botón en la grilla para clonar una entrada anterior del mismo proveedor/producto cambiando solo el peso. Ahorra tiempo en operaciones repetitivas.

**⌨️ Modo teclado rápido:**
En el formulario de entrada, Tab navega entre campos en orden lógico. Enter en el último campo guarda. Para operadores de báscula que no quieren usar el mouse.

**📱 Vista compacta para tablet:**
Sidebar colapsable para operar desde tabletas en la báscula. El display de peso ocupa media pantalla.

**🔔 Notificaciones en tiempo real (polling):**
Cada 2 minutos, el frontend consulta GAS si hay nuevas alertas (canasillas vencidas, devoluciones pendientes de aprobación) y las muestra en la campana del topbar.

**🕐 Registro de turno:**
El sistema registra automáticamente el inicio y fin de sesión. El supervisor puede ver quién trabajó en cada turno.

### 8.2 Inventario y trazabilidad

**🗺️ Trazabilidad completa de canasilla:**
Buscar por propietario y ver el historial de todos sus movimientos — cuándo salió, con qué entrada, cuándo retornó.

**📐 Alertas configurables:**
El admin define cuántos días de alerta para canasillas (actualmente hardcoded en 7). También puede configurar alertas de stock mínimo por propietario.

**📦 Conciliación de canasillas:**
Módulo especial donde el supervisor compara el stock teórico (calculado por el sistema) vs. el conteo físico. Registra diferencias y genera ajuste con motivo.

**🔖 Etiquetas de identificación:**
Generar PDF de etiquetas para canasillas propias de la empresa (código, propietario, fecha de asignación) imprimibles en etiquetadora estándar.

### 8.3 Reportes y análisis

**📈 Reporte de proveedor:**
Para un proveedor específico en un rango de fechas: total kg entregados, número de entregas, devoluciones, promedio de peso por entrega, canasillas en circulación.

**📈 Reporte de cliente:**
Para un cliente específico: total kg recibidos, historial de entregas, deuda de canasillas.

**📈 Reporte de producto:**
Evolución de volumen recibido por semana/mes. Qué proveedores entregan qué productos.

**📈 Resumen mensual automático:**
Cada 1ro del mes, el sistema puede generar automáticamente el resumen del mes anterior en una hoja separada de Sheets (trigger de tiempo en GAS).

**📊 Gráficas en dashboard:**
- Barras: entradas por día (últimos 15 días)
- Dona: distribución de kg por producto
- Línea: evolución de peso libre diario
Usando Chart.js via CDN, paleta de colores coherente con el diseño.

### 8.4 Futuras integraciones

**📡 Báscula digital directa (futuro):**
Si la báscula tiene puerto serial o Bluetooth, integración via Web Serial API para leer el peso automáticamente sin digitarlo. El peso aparece en el campo con animación de "capturando...".

**💬 Notificaciones WhatsApp (futuro):**
Al aprobar una devolución, enviar mensaje automático al proveedor via Twilio o CallMeBot API desde GAS.

**🗄️ Migración a Supabase (futuro):**
Cuando el volumen de datos supere los límites de Sheets (50k filas/hoja), migrar la capa de datos a Supabase PostgreSQL. La capa de GAS se reemplaza por Supabase Edge Functions. El frontend HTML/JS no cambia.

**📲 PWA (futuro):**
Convertir el web app en Progressive Web App con service worker para uso offline básico (registrar entradas sin internet, sincronizar cuando vuelva la conexión).

---

## 9. CONSIDERACIONES TÉCNICAS IMPORTANTES PARA EL DESARROLLADOR

### Limitaciones de GAS a tener en cuenta:
- Tiempo máximo de ejecución por request: **6 minutos** (más que suficiente, pero evitar loops grandes)
- Cuota de URL Fetch: 20,000 llamadas/día (para futuras integraciones externas)
- Google Sheets: máximo ~5 millones de celdas por archivo — usar archivo separado para el log cuando supere 100k filas
- Las respuestas de GAS **no tienen CORS** nativamente — el doPost debe retornar headers correctos:
  ```javascript
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
  ```
- Para evitar el problema de CORS en desarrollo: usar el Web App URL directamente, no llamadas a la API de Sheets

### Seguridad:
- **Nunca** almacenar contraseñas en texto plano. Usar `Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password)` en GAS y convertir a hex
- El token de sesión debe validarse en CADA request a GAS, no solo en el login
- Los IDs de las hojas de Sheets no deben exponerse en el frontend — usar siempre el API de GAS como intermediario
- Rate limiting básico: si un email tiene >5 intentos fallidos en 10 minutos, bloquear por 15 minutos (registrar en columna `IntentosFallidos` + `BloqueadoHasta` en hoja Usuarios)

### Performance:
- En Sheets, usar `getValues()` para leer rangos completos en una sola llamada (nunca `getValue()` en loop — causa timeout)
- Paginar las consultas grandes: GAS retorna max 500 filas por request, el frontend pide la siguiente página
- Cache de maestros en `localStorage`: Proveedores, Clientes, Productos y TiposCanasilla se cargan al login y se usan localmente para los selects (invalidar cache al volver a conectar o cada 4 horas)

---

## 10. FLUJO DE DESARROLLO SUGERIDO

```
Sprint 1 (base):
  ✅ Estructura HTML/CSS del shell (layout, sidebar, topbar)
  ✅ Sistema de auth completo (login, token, roles, sesión)
  ✅ Módulo Maestros básico (CRUD proveedores, clientes, productos)
  ✅ GAS: estructura de hojas + funciones base

Sprint 2 (core):
  ✅ Módulo Nueva Entrada completo con display de báscula
  ✅ Grilla de Registro de Entradas con búsqueda y filtros
  ✅ Log de actividad (escritura automática)
  ✅ PDF de entrada individual

Sprint 3 (inventario):
  ✅ Módulo de Canasillas con stock en tiempo real
  ✅ Movimientos y log de canasillas
  ✅ Sistema de alertas (> N días)
  ✅ Devoluciones básicas

Sprint 4 (reportes y pulido):
  ✅ Reportes PDF (diario, proveedor, cliente)
  ✅ Export Excel de grillas
  ✅ Dashboard con gráficas
  ✅ Gestión de usuarios
  ✅ Notificaciones en tiempo real
  ✅ QA general y optimización
```

---

*Prompt generado para Antigravity — Basket Flow v1.0*
*Sistema de gestión de operaciones de báscula y mercancía Fresh Produce*
*Stack: HTML + CSS + JS + Google Apps Script + Google Sheets*