import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DocumentBuilder,
  ReferenceObject,
  SchemaObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common';

const isUntypedObject = (property: SchemaObject | ReferenceObject): boolean =>
  !('$ref' in property) &&
  property.type === 'object' &&
  !property.properties &&
  !property.additionalProperties &&
  !property.allOf &&
  !property.oneOf &&
  !property.anyOf;

describe('OpenAPI document (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();

    configureApp(app);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should declare a concrete type for every schema property', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );

    const untypedProperties = Object.entries(
      document.components?.schemas ?? {},
    ).flatMap(([schemaName, schema]) =>
      Object.entries('properties' in schema ? (schema.properties ?? {}) : {})
        .filter(([, property]) => isUntypedObject(property))
        .map(([propertyName]) => `${schemaName}.${propertyName}`),
    );

    expect(untypedProperties).toEqual([]);
  });
});
