import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { json } from "express";
import express from "express";
import { join } from "node:path";
import { AppModule } from "./app.module";
import { PrismaService } from "./common/prisma.service";
import { bootstrapSqliteDatabase } from "./common/sqlite-bootstrap";

async function bootstrap() {
  process.env.DATABASE_URL ??= "file:../storage/dev.db";
  process.env.PORT ??= "3100";
  bootstrapSqliteDatabase();
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true,
    credentials: true
  });
  app.use(json({ limit: "10mb" }));
  app.use("/downloads", express.static(join(process.cwd(), "storage", "exports")));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  );

  const config = new DocumentBuilder()
    .setTitle("论文降重工具 API")
    .setDescription("前后端分离骨架版接口文档")
    .setVersion("1.0.0")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document);

  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);

  await app.listen(Number(process.env.PORT));
}

void bootstrap();
