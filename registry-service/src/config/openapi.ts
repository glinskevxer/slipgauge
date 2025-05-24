import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

import type { LabConfig } from './lab.config';

/**
 * The published contract for the console and for the two customer systems that
 * poll the recall board.
 *
 * <p>Written here rather than sprinkled through the controllers as
 * annotations, because the description of the register is a document that gets
 * argued over and it is easier to argue over it in one file.
 */
export function buildOpenApiDocument(app: INestApplication, lab: LabConfig): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle(`${lab.name} calibration registry`)
    .setDescription(
      [
        'The register of measuring equipment, its calibration history and the',
        'traceability behind it.',
        '',
        'Two things are worth knowing before reading the rest. Tolerance limits',
        'and verdicts are never accepted from a caller: they are worked out from',
        'the profile the instrument is held to and the uncertainty the bench',
        'reported. And a certificate is never edited. A mistake is corrected by',
        'withdrawing it and filing a replacement that points back at it.',
      ].join('\n'),
    )
    .setVersion(lab.version)
    .setContact('Quality office', lab.website, lab.contactEmail)
    .addServer('/', 'This deployment')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'registry-token',
    )
    .addTag('instruments', 'The register itself')
    .addTag('certificates', 'Calibration results and the chain behind them')
    .addTag('recalls', 'What is due, what is late and why the interval is what it is')
    .addTag('usage', 'What each instrument was used on')
    .addTag('impact', 'What an out of tolerance result reached')
    .addTag('accounts', 'People and what they may do')
    .build();

  return SwaggerModule.createDocument(app, config);
}

/** Serves the document and the browser at /api/docs. */
export function mountOpenApi(app: INestApplication, lab: LabConfig): void {
  const document = buildOpenApiDocument(app, lab);

  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs.json',
    swaggerOptions: {
      // A reader who has just signed in should not have to paste the token in
      // again on every reload.
      persistAuthorization: true,
      docExpansion: 'none',
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });
}
