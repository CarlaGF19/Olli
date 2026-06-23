# Olli - Asistente Local Para Clases Y Transcripciones

<div align="center">

![Olli](https://img.shields.io/badge/Olli-Local%20AI%20Workspace-135BF1?style=for-the-badge)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=111827)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-111827?style=for-the-badge&logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-Local-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![MIT License](https://img.shields.io/badge/License-MIT-10B981?style=for-the-badge)

*Transcribe clases, organiza reuniones y consulta tus apuntes con IA opcional, manteniendo tus datos bajo control local.*

</div>

Olli es una aplicacion local para grabar clases, transcribir audio, organizar reuniones y generar resumenes con IA bajo control del usuario. El proyecto esta pensado para funcionar primero en una laptop, con almacenamiento local en SQLite, autenticacion propia y uso opcional de Gemini solo cuando el usuario decide analizar, resumir o consultar una transcripcion.

La prioridad del producto es clara: la transcripcion y el chat de apoyo deben ser utiles sin convertir cada clase en una dependencia permanente de servicios externos.

## Estado Del Proyecto

- App local con React, Vite, Express y SQLite.
- Login y registro propios, sin Google/Firebase como autoridad de cuenta.
- Transcripcion local en navegador usando Whisper via `@xenova/transformers`.
- Gemini opcional para resumenes, puntos clave, acciones y chat sobre conversaciones.
- Carpetas locales para organizar reuniones por curso o tema.
- Exportacion PDF academica con transcripcion segmentada por tiempo.
- Eliminacion agresiva de cuenta con codigo numerico temporal.
- Chequeo de secretos y auditoria de dependencias antes de publicar.

## Stack Tecnico

### Frontend

- React 19
- Vite
- Tailwind CSS
- Motion
- Lucide React
- Web Workers para Whisper local
- IndexedDB como cache local auxiliar

### Backend

- Node.js
- Express
- SQLite via `sql.js`
- Cookies de sesion `httpOnly`
- Proxy seguro para llamadas a Gemini
- Nodemailer para envio opcional de reportes

### Datos

- Base principal: `data/meetbrain.sqlite`
- Cache auxiliar: IndexedDB `OlliStore`
- Carpeta `data/` ignorada por Git
- Las API keys no se suben al repositorio

## Funcionalidades Principales

### Autenticacion Local

- Registro con usuario, correo y contrasena.
- Login por usuario o correo.
- Sesion local con cookie `httpOnly`.
- Recuperacion de contrasena mediante codigo local de recuperacion.
- Eliminacion definitiva de cuenta y datos.

### Grabacion Y Transcripcion

- Captura por microfono.
- Captura de audio digital de pestana o pantalla.
- Transcripcion local con Whisper dentro del navegador.
- Limite de grabacion de 2 horas.
- Notificacion de escritorio cuando quedan 10 minutos.
- Guardado de borradores en SQLite durante la captura.

### Explore

- Reuniones organizadas por carpeta.
- Filtro por carpeta.
- Selector desplegable para moverse entre varias reuniones.
- Vista de transcripcion primero.
- Summary bajo demanda para evitar gasto innecesario de Gemini.
- Chat de Olli sobre la conversacion seleccionada.

### IA Opcional

Gemini se usa solo para tareas que requieren razonamiento o generacion:

- Resumen ejecutivo.
- Overview.
- Action items.
- Outline.
- Preguntas al copiloto/chat.
- Analisis posterior de una transcripcion.

La transcripcion local no debe depender de Gemini.

### Exportacion

- PDF academico limpio.
- Titulo, fecha, duracion y fuente.
- Transcripcion segmentada por tiempo.
- Sin inventar hablantes si no existe diarizacion real.
- Envio opcional por email si SMTP esta configurado.

## Instalacion Local

### Requisitos

- Node.js 20 LTS o superior recomendado.
- npm.
- Microsoft Edge o Google Chrome para mejor compatibilidad de captura de pantalla/audio.

> Nota: Node 21 puede mostrar advertencias `EBADENGINE` con Vite. Para desarrollo estable se recomienda Node 20 LTS o Node 22 LTS.

### Pasos

```bash
npm install
npm run dev
```

La aplicacion queda disponible en:

```text
http://127.0.0.1:3000/
```

### Inicio Facil Para Windows

Este es el camino recomendado para alguien que no programa:

1. Instala Node.js 20 LTS o 22 LTS desde [nodejs.org](https://nodejs.org/).
2. Clona el repositorio `https://github.com/CarlaGF19/Olli.git` desde Codex, GitHub Desktop o Git.
3. Abre la carpeta clonada.
4. Haz doble clic en `ejecutar_windows.bat`.
5. Espera. En el primer inicio se instalaran dependencias y luego se abrira Olli en `http://127.0.0.1:3000`.
6. Crea una cuenta propia desde la pantalla de acceso. No compartas usuarios, contrasenas ni API keys.

Para detener Olli, vuelve a la ventana negra que abrio el lanzador y presiona `Ctrl+C`.

El primer uso de Whisper tambien puede descargar su modelo local. Esa descarga solo ocurre una vez por perfil del navegador, salvo que se borre su cache.

## Variables De Entorno

Crea un archivo `.env` o `.env.local` si necesitas configurar servicios opcionales. Estos archivos no se suben a Git.

| Variable | Uso | Obligatoria |
| --- | --- | --- |
| `GEMINI_API_KEY` | Key opcional de servidor para Gemini si el usuario no guarda una desde la UI. | No |
| `APP_URL` | URL publica/local usada para enlaces. Ejemplo: `http://127.0.0.1:3000`. | No |
| `SMTP_HOST` | Servidor SMTP para envio real de reportes por email. | No |
| `SMTP_PORT` | Puerto SMTP. Comunmente `587` o `465`. | No |
| `SMTP_USER` | Usuario SMTP. | No |
| `SMTP_PASS` | Contrasena SMTP. | No |
| `SMTP_FROM` | Remitente de los correos. | No |

Importante:

- Nunca publiques `.env`, `.env.local`, `data/` ni archivos SQLite.
- Si una API key se filtra, revocala inmediatamente en el proveedor.
- El repositorio contiene `.env.example` solo como plantilla.

## Scripts

```bash
npm run dev
```

Levanta Express y Vite en modo local.

```bash
npm run build
```

Compila frontend y backend en `dist/`.

```bash
npm run start
```

Ejecuta el build de produccion.

```bash
npm run lint
```

Valida TypeScript sin emitir archivos.

```bash
npm run security:check
```

Escanea archivos versionados/no versionados permitidos para evitar secretos obvios o datos privados.

```bash
npm audit
```

Revisa vulnerabilidades conocidas en dependencias.

## Arquitectura

```text
React/Vite UI
  |
  |-- Web Worker Whisper local
  |-- IndexedDB cache opcional
  |
Express API local
  |
  |-- SQLite local: data/meetbrain.sqlite
  |-- Gemini SDK solo para IA opcional
  |-- SMTP opcional para reportes
```

## API Local

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/reset-password`

### Cuenta

- `GET /api/account/deletion-preview`
- `DELETE /api/account`

La eliminacion requiere codigo numerico temporal. El codigo expira en 3 minutos y se invalida al borrar.

### Reuniones

- `GET /api/meetings`
- `POST /api/meetings`
- `PATCH /api/meetings/:id`
- `DELETE /api/meetings/:id`

### Carpetas

- `GET /api/folders`
- `POST /api/folders`
- `DELETE /api/folders/:id`

Al borrar una carpeta, sus reuniones se conservan y pasan a `Sin carpeta`.

### Settings

- `GET /api/settings`
- `PUT /api/settings`

### IA Y Exportacion

- `POST /api/transcribe`
- `POST /api/analyze`
- `POST /api/chat`
- `POST /api/email-report`

## Seguridad

Controles implementados:

- `.env*`, `data/`, SQLite y bases locales fuera de Git.
- Cookie de sesion `httpOnly`, `sameSite=lax` y `secure` en produccion.
- Rate limits para auth, recovery, escrituras, IA, transcripcion y email.
- Limites de payload por ruta.
- Validacion de MIME de audio.
- Sanitizacion basica de nombres de PDF y campos de email.
- Endpoint de email autenticado.
- Errores de produccion sin detalles internos.
- Eliminacion de cuenta con codigo numerico temporal de 3 minutos.
- `npm run security:check` para detectar secretos antes de publicar.
- Dependencias auditadas con `npm audit`.

Ultima validacion realizada:

- `npm audit`: 0 vulnerabilidades.
- `npm run lint`: OK.
- `npm run build`: OK.
- `npm run security:check`: OK.

Riesgos a vigilar si se despliega en internet:

- CSRF en rutas mutables si se usa un dominio publico con cookies.
- SQLite expuesto por mala configuracion de Docker/AWS.
- Backups sin cifrar.
- Logs que incluyan transcripciones o API keys.
- CORS demasiado abierto.
- Falta de HTTPS.
- Rate limits en memoria si hay multiples instancias.

Ver tambien:

- `SECURITY_HARDENING.md`
- `security_spec.md`

## Datos Locales Y Privacidad

Los datos del usuario viven localmente:

```text
data/meetbrain.sqlite
```

Este archivo puede contener:

- Usuarios locales.
- Hashes de contrasenas.
- Sesiones.
- Codigos de recuperacion.
- Reuniones.
- Transcripciones.
- Resumenes.
- API key de Gemini si el usuario la guarda.

Por eso `data/` esta en `.gitignore`.

## Produccion Local

Para compilar y ejecutar:

```bash
npm run build
npm run start
```

Para usarlo en otra laptop:

1. Clonar el repositorio.
2. Ejecutar `npm install`.
3. Ejecutar `npm run dev`.
4. Crear una cuenta local desde la pantalla inicial.
5. Configurar Gemini desde Settings si se desean resumenes/chat.

## Despliegue En Nube Privada

Olli puede vivir en una nube privada como AWS, pero deja de ser 100% local. Antes de exponerlo:

- Usar HTTPS obligatorio.
- Configurar dominio y proxy reverso.
- Mover rate limits a Redis si hay mas de una instancia.
- Cifrar backups.
- Restringir acceso al servidor.
- Proteger variables de entorno con un secret manager.
- Revisar CORS y CSRF.
- No montar `data/` como carpeta publica.

## Troubleshooting

### La transcripcion no aparece

- Usa Chrome o Edge.
- Al compartir pantalla/pestana, activa la opcion de compartir audio.
- Verifica que Whisper este activado en la UI.
- Espera a que el modelo cargue la primera vez.
- Revisa si el audio realmente tiene voz clara y no solo musica.

### Gemini no responde

- Revisa que haya una API key valida en Settings o `GEMINI_API_KEY`.
- Verifica cuota y limites de Google AI Studio.
- Usa resumenes/chat solo cuando sea necesario.

### El PDF sale vacio o pobre

- Revisa que la reunion tenga transcripcion real.
- Si solo hay musica o silencio, Olli no debe inventar contenido.
- Genera Summary solo cuando haya texto suficiente.

### El navegador no permite notificaciones

- Permite notificaciones para `127.0.0.1`.
- Revisa permisos del navegador.
- La alerta de 10 minutos solo aparece durante grabaciones largas.

## Convenciones Del Proyecto

- No subir secretos.
- No subir SQLite ni `data/`.
- Mantener Gemini como IA opcional, no como requisito para transcribir.
- No inventar hablantes en PDF si no hay diarizacion real.
- Priorizar transcripcion y chat sobre elementos decorativos.
- Validar con `lint`, `build`, `audit` y `security:check` antes de publicar.

## Licencia

Este proyecto esta distribuido bajo licencia abierta MIT.

Puedes usarlo, modificarlo y adaptarlo respetando los terminos de la licencia. Consulta el archivo `LICENSE` para el texto completo.
