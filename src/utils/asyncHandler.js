// ============================================================
//  src/utils/asyncHandler.js
//
//  Express 4 no captura los rechazos de los manejadores `async`.
//  Si un controlador lanza, la promesa queda sin capturar y el
//  proceso node termina: la API se cae en vez de responder.
//
//  Para que `src/middleware/errorHandler.js` pueda hacer su
//  trabajo, cada manejador asincrono se envuelve con esto. El
//  error viaja por `next()` y ahi se traduce a la respuesta.
//
//  Sin esto, un error de negocio como "Stock insuficiente."
//  mataria el servidor en lugar de devolver un 409 controlado.
// ============================================================
export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export default asyncHandler;
