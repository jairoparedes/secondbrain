# Second Brain — Conceptos y tecnologías, explicados

> **Audiencia:** cualquier persona que quiera entender cómo funciona este
> sistema por dentro. No asume conocimiento previo de programación.
> Si algo aparece en negrita o en `código`, está explicado más abajo.

---

## 1. ¿Qué es Second Brain en una frase?

**Un cuaderno privado que vive en la nube.** Funciona como una libreta de
notas digital, pero con tres diferencias clave:

1. **Nadie más que vos ve tus notas**, ni siquiera quien administra el
   servidor, porque se cifran en tu propio navegador antes de salir.
2. **Podés buscar por significado**, no solo por palabras exactas. Si tenés
   una nota sobre "un perro ladrando" y buscás "mascota ruidosa", la
   encuentra igual.
3. **Funciona sin internet** y se sincroniza cuando vuelve la conexión,
   igual que tu app del banco en modo avión.

---

## 2. La analogía del restaurante

Para entender cómo se comunican las piezas del sistema, imaginá un
restaurante:

| Pieza del sistema | Equivalente en el restaurante |
|---|---|
| **Navegador / PWA** | El **cliente** que entra y se sienta a la mesa |
| **Nginx** | El **maître** en la puerta: recibe a todos y decide a dónde mandar a cada uno |
| **Next.js** | El **salón** donde se sirve la comida (lo que el cliente ve) |
| **Laravel** | La **cocina**: prepara los pedidos y conoce las reglas de la casa |
| **PostgreSQL** | La **despensa**: donde se guardan los ingredientes (los datos) |
| **Redis** | La **mesada caliente**: cosas que se usan mucho, a mano rápido |
| **MinIO** | El **depósito grande**: cajas pesadas, archivos adjuntos |
| **Queue Worker** | El **ayudante de cocina**: tareas lentas que no hacen esperar al cliente |
| **OpenAI** | Un **sommelier contratado afuera**: experto en un tema muy específico |

Cuando un cliente pide algo:
1. El **maître** (Nginx) lo recibe en la puerta.
2. Si pide *ver el menú*, lo manda al **salón** (Next.js).
3. Si pide *una comida*, lo manda a la **cocina** (Laravel).
4. La cocina busca ingredientes en la **despensa** (PostgreSQL), mira si ya
   tiene algo listo en la **mesada caliente** (Redis) o busca algo grande en
   el **depósito** (MinIO).
5. Si la cocina tiene que hacer algo que tarda mucho (por ejemplo, preparar
   un postre de 2 horas), se lo pasa al **ayudante** (Queue Worker) y le
   entrega al cliente algo rápido mientras tanto.

---

## 3. Las capas del sistema

Conceptualmente, todo el software se organiza en **cuatro capas**, de
arriba hacia abajo:

```
┌─────────────────────────────────────────┐
│ CLIENTE        (el dispositivo del usuario)
├─────────────────────────────────────────┤
│ EDGE           (la puerta de entrada: Nginx)
├─────────────────────────────────────────┤
│ APLICACIÓN     (frontend Next.js + backend Laravel + worker)
├─────────────────────────────────────────┤
│ DATOS          (Postgres + Redis + MinIO)
└─────────────────────────────────────────┘
```

**Regla general:** una capa solo habla con la capa inmediatamente inferior.
El cliente no accede directo a la base de datos; el frontend no ejecuta
código en Postgres. Esto es lo que permite, por ejemplo, cambiar la base
de datos en el futuro sin tener que reescribir el frontend.

---

## 4. Glosario de tecnologías

Cada entrada responde tres preguntas: **qué es**, **para qué lo usamos** y
**una analogía**.

### 4.1. Docker y Docker Compose

- **Qué es:** una forma de empacar una aplicación junto con todo lo que
  necesita (librerías, versiones, configuración) en una especie de "caja
  sellada" llamada contenedor.
- **Para qué lo usamos:** levantar todo el stack con un solo comando
  (`docker compose up -d`), idéntico en Windows, Mac y Linux.
- **Analogía:** es un **contenedor de barco**. Da igual el puerto o la
  grúa: el contenedor llega exactamente igual.

### 4.2. Nginx

- **Qué es:** un servidor web muy rápido que funciona como **proxy
  reverso**. Recibe peticiones HTTP y las reenvía a quien corresponda.
- **Para qué lo usamos:** tener un único punto de entrada en el puerto 80.
  Las direcciones que empiezan con `/api` van al backend; el resto, al
  frontend.
- **Analogía:** el **portero de un edificio** que pregunta "¿a qué
  departamento va?" y te acompaña al ascensor correcto.

### 4.3. Next.js (frontend)

- **Qué es:** un framework para construir aplicaciones web modernas con
  **React** y **TypeScript**.
- **Para qué lo usamos:** construir la interfaz que el usuario ve (páginas
  de login, lista de notas, editor).
- **Analogía:** el **escaparate y las vidrieras** de una tienda: lo visible
  y atractivo, lo que hace que la gente entre.

Conceptos asociados:
- **PWA (Progressive Web App):** una web que se comporta como una app
  nativa; se puede instalar, funciona offline, manda notificaciones.
- **Tailwind CSS:** un sistema de estilos por clases pequeñas
  (`text-lg`, `bg-blue-500`, `p-4`) que se combinan como piezas de Lego.

### 4.4. Laravel (backend)

- **Qué es:** un framework de PHP para construir APIs y aplicaciones web.
- **Para qué lo usamos:** manejar toda la lógica de negocio (crear cuentas,
  guardar notas, listar tags, proteger rutas con login).
- **Analogía:** el **cerebro operativo del restaurante**: recibe los
  pedidos, conoce las recetas y decide quién hace qué.

Conceptos asociados:
- **API REST:** una forma estándar de comunicarse por HTTP usando verbos
  (`GET` para leer, `POST` para crear, `PUT` para modificar, `DELETE` para
  borrar) y devolviendo JSON.
- **JSON:** un formato simple de datos (`{"nombre": "Ana", "edad": 30}`).
- **Sanctum:** el sistema de "tarjetas de identidad" que usamos. Cuando te
  logueás te damos un **token Bearer** (una cadena secreta) que mandás en
  cada petición para probar quién sos.
- **Dominios:** organizamos el código por áreas (`Auth`, `Notes`, `Tags`,
  `Search`, `Sync`). Cada dominio es casi un mini-proyecto dentro del proyecto.

### 4.5. PHP-FPM y FastCGI

- **Qué es:** la forma en que Nginx habla con Laravel. PHP no se ejecuta
  "directamente" en el navegador: Nginx le pasa la petición a PHP-FPM por
  un canal llamado FastCGI, y recibe la respuesta de vuelta.
- **Analogía:** la **ventanita** entre el salón del restaurante y la
  cocina. Se pasan platillos y comandas por ahí sin que nadie entre al
  otro lado.

### 4.6. PostgreSQL

- **Qué es:** una **base de datos relacional**: organiza datos en tablas
  con filas y columnas, como planillas de Excel conectadas entre sí.
- **Para qué lo usamos:** guardar usuarios, notas, tags y todo lo que
  debe sobrevivir a reinicios.
- **Analogía:** un **archivador con fichas**. Cada tabla es un cajón, cada
  fila es una ficha.

Conceptos asociados:
- **Migración:** un archivo que describe *cómo crear o cambiar* una tabla.
  Si mañana añadimos una columna, se crea una nueva migración y todos los
  equipos aplican el mismo cambio sin errores.
- **Soft delete:** cuando "borrás" una nota, en realidad se marca con una
  fecha `deleted_at`. Queda en la "papelera" y se puede restaurar.
- **UUID:** identificador aleatorio tipo `a199ca64-1a6e-4...`. Se genera
  en cualquier parte sin riesgo de chocar con otro, perfecto para apps
  offline que sincronizan después.

### 4.7. pgvector

- **Qué es:** una extensión de Postgres que sabe manejar **vectores**
  (listas largas de números que representan el "significado" de un texto).
- **Para qué lo usamos:** búsqueda semántica. Si convertís tus notas en
  vectores, podés preguntar "encontrame lo más parecido a esto" y Postgres
  ordena por cercanía.
- **Analogía:** en lugar de buscar palabras idénticas en un diccionario
  (`texto == "perro"`), buscás coordenadas cercanas en un mapa. Dos puntos
  cercanos significan conceptos parecidos.

### 4.8. Redis

- **Qué es:** una base de datos **en memoria** (vive en la RAM), pensada
  para ser muy rápida.
- **Para qué lo usamos:** tres cosas al mismo tiempo:
  - **Cache:** guardar respuestas frecuentes para no recalcularlas.
  - **Sesiones:** si usás login por cookie en el futuro, aquí viven.
  - **Colas:** lista de trabajos pendientes que el Queue Worker irá
    procesando de a uno.
- **Analogía:** una **pizarra en la pared** con post-its de cosas por
  hacer y cosas memorizadas. Todos la ven y actualizan al instante.

### 4.9. MinIO

- **Qué es:** un almacén de **objetos** (archivos enteros) compatible con
  el protocolo S3 de Amazon.
- **Para qué lo usamos:** guardar adjuntos de notas, exportaciones, backups.
  Cosas que no caben naturalmente en una tabla (PDFs, imágenes).
- **Analogía:** el **depósito del restaurante**. Bultos grandes numerados
  que podés pedir por nombre y se entregan enteros.

### 4.10. Queue Worker

- **Qué es:** un proceso del backend que corre en paralelo y solo se
  dedica a ejecutar **trabajos** sacados de una cola en Redis.
- **Para qué lo usamos:** hacer cosas lentas (mandar emails, generar
  embeddings con OpenAI, reindexar) sin que el usuario tenga que esperar
  la respuesta.
- **Analogía:** el **ayudante de cocina** que hace el postre mientras el
  chef sigue atendiendo pedidos nuevos.

### 4.11. OpenAI (opcional, Fase 4)

- **Qué es:** un servicio externo que, entre otras cosas, convierte texto
  en vectores (embeddings).
- **Para qué lo usamos:** generar los vectores que pgvector luego busca.
- **Advertencia:** es la única integración que **rompe el modelo
  zero-knowledge**, porque hay que mandarles el texto en claro. Por eso es
  **opt-in por usuario**: solo se usa si la persona lo activa
  explícitamente.

---

## 5. Conceptos transversales importantes

### 5.1. Zero-knowledge y cifrado extremo a extremo (E2E)

**Zero-knowledge** (cero conocimiento) significa que el servidor puede
guardar tus notas pero no puede leerlas, porque nunca vio la contraseña
ni la llave que las descifra.

El truco:
1. Cuando te registrás, el **navegador** toma tu contraseña y genera una
   **llave maestra** usando un algoritmo llamado **Argon2id**.
2. Esa llave **nunca sale del navegador**.
3. Cuando escribís una nota, el navegador la cifra con **AES-256-GCM**
   usando esa llave antes de enviarla al servidor.
4. El servidor guarda bytes que parecen ruido. Si alguien robara la base
   de datos, no podría leer nada.
5. Para ver tus notas en otro dispositivo, te logueás con tu contraseña,
   se vuelve a derivar la misma llave maestra en ese dispositivo y se
   descifran.

En el código esto está pensado pero se implementa en **Fase 2**. Por
ahora (Fase 1) las notas se envían sin cifrar; los campos `title_ciphertext`
y `content_ciphertext` aceptan el texto como una "caja opaca" que en
Fase 2 empezará a contener cifrado real sin cambiar el backend.

### 5.2. Búsqueda semántica vs. búsqueda textual

- **Textual (Fase 3):** busca si la palabra exacta aparece en la nota.
  Rápida, barata, pero no entiende sinónimos.
- **Semántica (Fase 4):** busca por significado, no por letras. Más lenta
  y más cara, pero encuentra "mascota ruidosa" cuando escribiste "perro
  ladrando".

La app usa ambas: primero la búsqueda textual para filtrar candidatos, y
luego la semántica para ordenarlos por relevancia.

### 5.3. Offline-first y sincronización (Fase 5)

La app está pensada para funcionar **sin internet**: se guarda todo en
**IndexedDB** (una base de datos dentro del navegador) y cuando vuelve la
conexión, sube los cambios al servidor y descarga los del servidor.

Si dos dispositivos modifican la misma nota al mismo tiempo, se aplica
**last-writer-wins** (gana el último) con la posibilidad de hacer un
**merge manual** si el usuario lo prefiere.

### 5.4. Soft delete

Cuando "borrás" algo en la app, en realidad no se elimina. Se marca con
una fecha `deleted_at`. Eso permite:

- Mostrar una "papelera" con lo eliminado.
- Restaurar sin perder datos.
- Tener trazabilidad si hace falta.

### 5.5. Autenticación con Sanctum

Cuando te logueás, el servidor te da un **token** (una cadena tipo
`6|99QfIgUIfKd...`). Vos lo guardás y en cada petición a la API lo
mandás en un encabezado:

```
Authorization: Bearer 6|99QfIgUIfKd...
```

El servidor valida ese token contra la tabla `personal_access_tokens` y
sabe quién sos. Si hacés logout, se borra esa fila: el token ya no sirve.

---

## 6. Recorrido paso a paso: crear una nota desde cero

Vamos a seguir el camino completo de una acción típica. Escenario:
**Ana abre la app, crea una cuenta y escribe su primera nota.**

### Paso 1 — Ana entra a la app

Ana escribe `http://localhost` en el navegador.

1. El navegador manda un pedido `GET /` al puerto 80.
2. **Nginx** lo recibe. Como la ruta es `/` y no `/api/...`, lo reenvía
   al contenedor de **Next.js** en el puerto 3000.
3. Next.js devuelve el HTML de la página principal.
4. Ana ve un botón "Registrarse".

### Paso 2 — Ana se registra

Completa el formulario con `ana@ejemplo.com` y su contraseña.

1. El frontend envía:
   ```
   POST /api/auth/register
   Content-Type: application/json

   { "email": "ana@ejemplo.com", "password": "secret1234" }
   ```
2. **Nginx** ve que la ruta es `/api/auth/register` y la reenvía a
   **Laravel** mediante FastCGI.
3. Laravel valida el pedido (email bien formado, contraseña de al menos
   8 caracteres, email no repetido).
4. Laravel guarda una fila en la tabla `users` de **PostgreSQL**.
5. Laravel crea un **token Sanctum** y lo guarda en
   `personal_access_tokens`.
6. Laravel responde:
   ```json
   {
     "data": {
       "user": { "id": "a1-...", "email": "ana@ejemplo.com" },
       "token": "1|aBcDeF...",
       "token_type": "Bearer"
     }
   }
   ```
7. El frontend guarda el `token` en memoria/localStorage.

### Paso 3 — Ana crea un tag "trabajo"

1. Hace click en "Nuevo tag" y escribe "trabajo".
2. El frontend envía:
   ```
   POST /api/tags
   Authorization: Bearer 1|aBcDeF...
   Content-Type: application/json

   { "name": "trabajo", "color": "#3b82f6" }
   ```
3. **Laravel** ve el header `Authorization` y activa el middleware
   `auth:sanctum`. Busca ese token en la base, encuentra al usuario Ana
   y pone su objeto en la request.
4. Valida que Ana no tenga ya un tag con ese nombre (usando un UNIQUE
   compuesto `(user_id, name)`).
5. Inserta la fila en la tabla `tags` con `user_id` = el id de Ana.
6. Responde `201 Created` con el tag completo incluyendo su UUID.

### Paso 4 — Ana escribe su primera nota

Ana abre el editor, escribe "Comprar leche y pan" y le asigna el tag
"trabajo".

1. El frontend envía:
   ```
   POST /api/notes
   Authorization: Bearer 1|aBcDeF...
   Content-Type: application/json

   {
     "title_ciphertext": "Recordatorio",
     "content_ciphertext": "Comprar leche y pan",
     "tag_ids": ["uuid-del-tag-trabajo"]
   }
   ```
   > En Fase 2, `title_ciphertext` y `content_ciphertext` serán texto
   > cifrado de verdad. Hoy son texto plano tratado como campo opaco.
2. **Laravel** autentica con el token.
3. Valida el payload y que el `tag_id` realmente pertenezca a Ana (para
   que alguien no pueda asignar notas a tags de otros usuarios).
4. Ejecuta un `INSERT` en la tabla `notes` con `user_id` = Ana.
5. Sincroniza la tabla pivote `note_tags` para vincular la nota al tag.
6. Responde `201 Created` con la nota completa y sus `tag_ids`.

### Paso 5 — Ana lista sus notas

1. El frontend envía:
   ```
   GET /api/notes?per_page=25
   Authorization: Bearer 1|aBcDeF...
   ```
2. Laravel autentica, lista las notas de Ana (no las de otros usuarios)
   ordenadas por `updated_at` descendente, con sus tags precargados.
3. Responde:
   ```json
   {
     "data": [
       {
         "id": "b2-...",
         "title_ciphertext": "Recordatorio",
         "content_ciphertext": "Comprar leche y pan",
         "tag_ids": ["uuid-del-tag-trabajo"],
         "created_at": "2026-04-22T00:49:36+00:00",
         "updated_at": "2026-04-22T00:49:36+00:00",
         "deleted_at": null
       }
     ],
     "meta": { "page": 1, "per_page": 25, "total": 1 }
   }
   ```

### Paso 6 — Ana se desloguea

1. Frontend envía `POST /api/auth/logout` con el Bearer.
2. Laravel borra esa fila de `personal_access_tokens`.
3. Frontend olvida el token.
4. Si Ana intenta `GET /api/auth/me` con el token viejo, recibe:
   ```json
   {
     "error": {
       "code": "UNAUTHENTICATED",
       "message": "Se requiere autenticación."
     }
   }
   ```
   con status `401`.

---

## 7. Qué pasa en Fase 4 cuando sumamos IA

Cuando se active la fase 4, el flujo cambia un poco:

1. Ana crea una nota igual que antes.
2. Laravel, además de insertar la fila en `notes`, **encola un trabajo**
   en Redis: *"generar embedding para la nota X"*.
3. Laravel responde `201` al frontend **sin esperar** la IA.
4. En paralelo, el **Queue Worker** saca el trabajo de la cola, llama a
   **OpenAI** con el contenido de la nota, recibe un vector de 1536
   números y lo guarda en la tabla `embeddings` usando pgvector.
5. La próxima vez que Ana busque algo por significado, Postgres compara
   el embedding de su búsqueda con los vectores guardados y devuelve las
   notas ordenadas por similitud.

Todo esto ocurre **sin bloquear la UI**: Ana nunca espera a OpenAI.

---

## 8. Por qué elegimos estas tecnologías (en 30 segundos cada una)

- **PostgreSQL en lugar de MySQL:** mejores tipos de datos (JSON nativo,
  UUID, arrays), extensiones potentes como pgvector. Mismo nivel de
  madurez.
- **pgvector en lugar de Elasticsearch para vectores:** una sola base de
  datos en vez de dos. Menos infraestructura hasta tener millones de notas.
- **Laravel en lugar de Node.js/Django/Rails:** ecosistema maduro, batteries
  included (auth, jobs, migrations, testing), sintaxis amigable, muy buen
  ORM (Eloquent).
- **Next.js en lugar de React puro:** App Router, SSR opcional, PWA simple,
  tooling moderno.
- **Sanctum en lugar de JWT:** tokens revocables por usuario, sin
  complejidad de firma/verificación asimétrica. Perfecto para apps propias.
- **Redis en lugar de RabbitMQ + Memcached + MySQL-session:** una sola
  tecnología resuelve caché, sesiones y colas. Menos piezas móviles.
- **MinIO en lugar de S3 real:** mismo protocolo, corre localmente para
  desarrollo, se cambia a S3 en producción cambiando una variable.
- **Docker Compose en lugar de instalar todo a mano:** reproducible,
  idéntico para todos los desarrolladores y en CI.

---

## 9. Lecturas recomendadas si querés profundizar

- **Laravel:** https://laravel.com/docs · lee "Routing", "Eloquent",
  "Validation", "Sanctum".
- **Next.js App Router:** https://nextjs.org/docs/app
- **PostgreSQL + pgvector:** https://github.com/pgvector/pgvector
- **Docker Compose:** https://docs.docker.com/compose/
- **Conceptos de cifrado simétrico y Argon2id:** buscá artículos sobre
  "AES-256-GCM explained" y "Argon2id password hashing".

---

## 10. Diagrama interactivo

El archivo [`architecture-corporate.html`](architecture-corporate.html)
contiene un diagrama visual interactivo de todo el sistema: hacé click en
cualquier nodo y ves sus detalles técnicos, ubicación en el repo y
chips de estado por fase.

Para la versión más informal con emojis y tema oscuro, está
[`architecture.html`](architecture.html).

---

*Documento mantenido por el equipo de desarrollo. Si algo quedó confuso,
abrí un issue o actualizá este mismo archivo.*
