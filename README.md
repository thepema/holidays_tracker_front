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

Con el servicio backend iniciado en el puerto `8080`, ejecuta desde la raíz del proyecto:

```bash
docker compose -f docker-compose.local.yml up --build
```

La aplicación estará disponible en `http://localhost:4200/` y usará `http://localhost:8080/` como URL de la API. Para detenerla:

```bash
docker compose -f docker-compose.local.yml down
```

El navegador realiza la llamada a la API, por lo que `localhost:8080` apunta al equipo local. Asegúrate de que el backend permita solicitudes CORS desde `http://localhost:4200`.

## Compilación

```bash
npm run build
```
