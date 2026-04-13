import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { bootstrapSqliteDatabase } from '../src/common/sqlite-bootstrap';
import { PrismaService } from '../src/common/prisma.service';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    // Set environment variable for test database to avoid affecting dev database
    process.env.DATABASE_URL = 'file:../storage/test.db';
    
    // Initialize test DB
    bootstrapSqliteDatabase();
    
    // Create testing module
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Models API', () => {
    it('/api/model-providers (GET)', async () => {
      const response = await request(app.getHttpServer()).get('/api/model-providers').expect(200);
      expect(response.body).toHaveProperty('code', 0);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('Dashboard API', () => {
    it('/api/dashboard/overview (GET)', async () => {
      const response = await request(app.getHttpServer()).get('/api/dashboard/overview').expect(200);
      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toHaveProperty('paperCount');
      expect(response.body.data).toHaveProperty('todayDetectionTasks');
    });
  });

  describe('Documents API', () => {
    it('/api/documents/:docId (DELETE)', async () => {
      const docId = `doc_e2e_delete_${Date.now()}`;

      await prisma.document.create({
        data: {
          docId,
          title: 'E2E 删除测试',
          language: 'zh-CN',
          sourceFileName: 'e2e-delete.txt',
          sourceFileType: 'txt',
          sourceFilePath: 'storage/uploads/e2e-delete.txt',
          status: 'ready',
        },
      });

      const response = await request(app.getHttpServer())
        .delete(`/api/documents/${docId}`)
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toMatchObject({
        success: true,
        docId,
      });

      const deletedDocument = await prisma.document.findUnique({
        where: { docId },
      });
      expect(deletedDocument).toBeNull();
    });
  });

  describe('Exports API', () => {
    it('/api/exports (POST/GET) should export only changed paragraphs and keep source file type', async () => {
      const docId = `doc_e2e_export_${Date.now()}`;

      await prisma.document.create({
        data: {
          docId,
          title: 'E2E 导出测试',
          language: 'zh-CN',
          sourceFileName: 'e2e-export.txt',
          sourceFileType: 'txt',
          sourceFilePath: 'storage/uploads/e2e-export.txt',
          status: 'ready',
        },
      });

      await prisma.documentParagraph.createMany({
        data: [
          {
            segmentId: `${docId}_seg_1`,
            docId,
            sectionId: null,
            text: '原始段落1',
            currentText: null,
            order: 1,
            paragraphType: 'body',
          },
          {
            segmentId: `${docId}_seg_2`,
            docId,
            sectionId: null,
            text: '原始段落2',
            currentText: '已修改段落2',
            order: 2,
            paragraphType: 'body',
          },
        ],
      });

      const createResponse = await request(app.getHttpServer())
        .post('/api/exports')
        .send({
          docId,
          exportType: 'final_doc',
        })
        .expect(201);

      expect(createResponse.body).toHaveProperty('code', 0);
      expect(createResponse.body.data).toHaveProperty('exportId');

      const exportId: string = createResponse.body.data.exportId;
      let exportTask: any = null;

      for (let index = 0; index < 30; index += 1) {
        const taskResponse = await request(app.getHttpServer())
          .get(`/api/exports/${exportId}`)
          .expect(200);

        exportTask = taskResponse.body.data;
        if (exportTask.status === 'done' || exportTask.status === 'failed') {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      expect(exportTask.status).toBe('done');
      expect(exportTask.downloadUrl).toMatch(/\.txt$/);

      const outputName = String(exportTask.downloadUrl).replace('/downloads/', '');
      const outputPath = join(process.cwd(), 'storage', 'exports', outputName);
      const exportedContent = await fs.readFile(outputPath, 'utf8');

      expect(exportedContent).toContain('原始段落1');
      expect(exportedContent).toContain('已修改段落2');
      expect(exportedContent).not.toContain('原始段落2');
    });
  });
});
