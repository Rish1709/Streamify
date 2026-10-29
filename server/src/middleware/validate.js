import { z } from 'zod';

/**
 * Validates req.body / req.query / req.params against zod schemas.
 * Parsed (coerced, defaulted, stripped) values are exposed as req.valid.{body,query,params}.
 * Express 5 makes req.query read-only, which is why results live on req.valid.
 */
export function validate(shapes) {
  const schemas = Object.fromEntries(
    Object.entries(shapes).map(([part, shape]) => [
      part,
      shape instanceof z.ZodType ? shape : z.object(shape),
    ]),
  );
  return (req, _res, next) => {
    req.valid = req.valid ?? {};
    for (const [part, schema] of Object.entries(schemas)) {
      // Throws ZodError, which the error handler maps to 400 VALIDATION_ERROR.
      req.valid[part] = schema.parse(req[part] ?? {});
    }
    next();
  };
}

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
