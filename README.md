# Holidays Tracker Frontend

Aplicación frontend creada con Angular 22.

## Requisitos

- Node.js compatible con Angular CLI 22
- npm
- Docker y Docker Compose (para el despliegue local con contenedores)

## Desarrollo

```bash
npm install
npm start
```

La aplicación estará disponible en `http://localhost:4200/`.

## Despliegue local con Docker

El backend `holidays_tracker_ws` debe estar ejecutándose en el puerto local `8080` (por ejemplo, configurando `PORT=8080` al iniciarlo). Desde la raíz de este repositorio, ejecuta:

```bash
docker compose -f docker-compose.local.yml up --build
```

La aplicación estará disponible en `http://localhost:4200/` y consumirá la API en `http://localhost:8080/`. Para detener el frontend:

```bash
docker compose -f docker-compose.local.yml down
```

El navegador realiza la llamada directamente a la API; por eso `localhost:8080` es el puerto publicado por el backend en tu equipo.

## Compilación

```bash
npm run build
```
