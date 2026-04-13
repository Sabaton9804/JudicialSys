# Solicitud técnica a TI — Servicio bridge (acceso mediado a SQL Server)

Documento listo para versionar en el repositorio o adjuntar en radicación formal a la Dirección de Tecnología.

---

## 1. Objeto de la solicitud

Solicitar la validación técnica y eventual despliegue institucional de un servicio backend intermedio (bridge) que permita el acceso controlado a bases de datos SQL Server ubicadas en la red interna del Consejo, sin exposición directa del motor a internet.

## 2. Descripción del modelo de funcionamiento actual

La solución implementada opera bajo un esquema de acceso mediado, conforme a las buenas prácticas de seguridad:

- La aplicación web **no** establece conexión directa con el motor de base de datos.
- El acceso se realiza a través de un servicio intermedio local (bridge) que:
  - Se ejecuta en un equipo conectado a la red institucional mediante VPN.
  - Utiliza autenticación integrada de Windows.
  - Canaliza las solicitudes mediante HTTP hacia el motor SQL Server.

### Flujo actual

```
Aplicación web (Next.js)
        ↓
Servicio local (bridge – HTTP)
        ↓
SQL Server (red interna – 172.16.x.x)
```

## 3. Justificación técnica

El modelo implementado garantiza:

- **No** exposición del puerto SQL Server (1433) a redes externas.
- Uso de la red institucional (VPN) como canal de acceso acorde a políticas vigentes.
- Autenticación integrada de Windows (alineada con políticas corporativas).
- Separación entre capa de presentación y acceso a datos.

En este sentido, la solución se alinea con el principio de mínima superficie de ataque y evita configuraciones inseguras como la apertura directa del motor de base de datos a internet.

## 4. Limitaciones del esquema actual

El servicio intermedio actualmente:

- Se ejecuta en estaciones de trabajo individuales.
- No cuenta con despliegue centralizado.
- Carece de gobierno institucional (alta disponibilidad, monitoreo, control de acceso formal).

Estas condiciones lo hacen adecuado para **pruebas y validación funcional**, pero **no** para operación productiva institucional sin el despliegue y gobierno que se solicitan en la sección 5.

## 5. Solicitud concreta a la Dirección de Tecnología

Se solicita **evaluar y autorizar** lo siguiente.

### 5.1 Despliegue institucional

- Implementación de un servicio backend **dentro** de la red interna, con:
  - Ejecución en infraestructura institucional (VM o servidor autorizado).
  - Acceso directo al SQL Server interno.
  - Exposición de endpoints HTTP **controlados** para consumo de aplicaciones autorizadas.

### 5.2 Seguridad y control

- Definición de un **usuario de dominio** específico para la ejecución del servicio.
- Configuración en SQL Server de:
  - Login
  - Usuario en base de datos
  - Permisos bajo **principio de mínimo privilegio** (evitar cuentas con privilegios administrativos innecesarios).

### 5.3 Gobierno del servicio

- Ejecución como **servicio del sistema** (no dependencia de procesos manuales en sesión de usuario).
- Registro de **logs estructurados** (sin datos sensibles en claro).
- Mecanismos de monitoreo y disponibilidad acordes con lineamientos institucionales.

### 5.4 Control de acceso a la API

- Autenticación entre aplicación y servicio (por ejemplo JWT o mTLS), según estándar institucional.
- Contratos de servicio documentados (OpenAPI o equivalente).
- Limitación de tasa de consumo (rate limiting) donde aplique.

## 6. Arquitectura objetivo propuesta

```
Aplicación web (externa o PaaS)
        ↓
API institucional (red interna – backend bridge)
        ↓
SQL Server (red interna)
```

## 7. Beneficios institucionales

- Centralización del acceso a bases de datos sensibles.
- Eliminación de dependencias críticas en equipos personales de usuario.
- Trazabilidad y auditoría de accesos.
- Reducción del riesgo de exposición de datos.
- Escalabilidad para múltiples aplicaciones que requieran el mismo patrón de acceso mediado.

## 8. Consideraciones finales

La solución actual constituye un **prototipo funcional** que valida el modelo de acceso mediado y la viabilidad técnica del flujo con VPN y autenticación Windows.

No obstante, su adopción como **operación oficial** requiere el despliegue controlado dentro de la infraestructura del Consejo, bajo lineamientos de seguridad, operación y auditoría definidos por la Dirección de Tecnología.

---

## Nota estratégica (uso interno del equipo)

Este planteamiento describe una arquitectura alineada con gobierno TI y control de riesgos, no un experimento aislado. Presentarlo como solicitud formal de despliegue y estándares (identidad, permisos, logs, contrato de API) mejora la probabilidad de trámite técnico serio frente a respuestas genéricas o devoluciones por imprecisión.
