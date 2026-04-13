/**
 * Convierte errores de conexión de mssql/tedious en texto entendible para usuarios no técnicos.
 */
export function mensajeConexionSqlParaUsuario(mensajeTecnico: string): string {
  const t = (mensajeTecnico || '').toLowerCase()

  /** Tedious + Trusted_Connection a veces falla aunque pyodbc/ODBC en el mismo PC funcione (SSPI, dominio, etc.). */
  if (
    t.includes('sspi') ||
    t.includes('cannot generate sspi') ||
    t.includes('negotiate') ||
    t.includes('kerberos') ||
    t.includes('18452') ||
    t.includes('untrusted domain') ||
    t.includes('18450') ||
    (t.includes('login failed') && (t.includes('windows') || t.includes('trusted')))
  ) {
    return 'El SQL rechazó o no pudo completar el inicio de sesión con cuenta de Windows (integrado). Eso puede pasar aunque su navegador y la VPN estén bien y hasta aunque ODBC con el mismo DSN funcione: JudicialSys usa Node.js, no el driver ODBC de Windows, y la integración SSPI/Kerberos es más exigente. Pruebas útiles: (1) que el proceso de Next.js corra en Windows con el mismo usuario de dominio autorizado en SQL; (2) pedir a sistemas un usuario y contraseña SQL y desmarcar «cuenta de Windows»; (3) confirmar que no ejecuta Next dentro de WSL/Docker sin red propia. Detalle técnico para sistemas: ' +
      mensajeTecnico.trim().slice(0, 220)
  }

  if (
    t.includes('certificate') ||
    t.includes('encrypt') ||
    t.includes('ssl') ||
    t.includes('tls')
  ) {
    return 'Fallo relacionado con cifrado (certificado/TLS) entre JudicialSys y SQL Server. En SQL antiguo de red interna suele bastar con no forzar cifrado: no defina JUSTICIA_XXI_SQL_ENCRYPT en el .env (el valor por defecto es sin cifrado) o póngala en false. Si usa cadena completa en JUSTICIA_XXI_SQL_CONNECTION_STRING, quite Encrypt=true de ahí. Para Azure SQL u obligatoriedad de TLS, use JUSTICIA_XXI_SQL_ENCRYPT=true y coordine el certificado con sistemas. Detalle: ' +
      mensajeTecnico.trim().slice(0, 180)
  }

  if (
    t.includes('failed to connect') ||
    t.includes('could not connect') ||
    t.includes('econnrefused') ||
    t.includes('etimedout') ||
    t.includes('timeout') ||
    t.includes('esocket') ||
    t.includes('getaddrinfo') ||
    t.includes('enotfound')
  ) {
    return 'No se pudo llegar al SQL Server por red. Eso no significa necesariamente que su PC esté «fuera de la red»: a menudo falta o está mal la IP en «Equipo servidor», el puerto no es 1433, o un firewall bloquea el tráfico. Quien intenta la conexión es el proceso de JudicialSys en el equipo/servidor donde corre Next.js (no solo el navegador). Revise con sistemas la IP, puerto y VPN; si en ODBC usa un DSN, copie el mismo valor del campo Server (ej. 172.16.155.193). Si la dirección incluye nombre de instancia con \\, péguela entera en Equipo servidor.'
  }

  if (t.includes('login failed') || t.includes('18456') || t.includes('does not have access')) {
    return 'El usuario o la contraseña no coinciden con los de la base de datos. Verifique mayúsculas y que no sea el usuario del correo ni de la página web.'
  }

  if (t.includes('cannot open database') || t.includes('4060')) {
    return 'No se pudo abrir la base de datos con el nombre indicado. Confirme con el juzgado el nombre exacto (no siempre es «consejo»).'
  }

  const corto = mensajeTecnico.trim().slice(0, 160)
  return corto.length > 0
    ? `No se pudo registrar en Justicia XXI. Si necesita ayuda, envíe este texto a sistemas: ${corto}`
    : 'No se pudo registrar en Justicia XXI. Intente de nuevo o consulte con sistemas del juzgado.'
}
