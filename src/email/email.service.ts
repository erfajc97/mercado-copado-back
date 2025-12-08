import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import * as fs from 'fs';
import * as path from 'path';

interface EmailOptions {
  to: string;
  subject: string;
  templateName: string;
  replacements: Record<string, string>;
}

@Injectable()
export class EmailService {
  private readonly resend: Resend;

  constructor(private readonly configService: ConfigService) {
    this.resend = new Resend(this.configService.get<string>('RESEND_API_KEY'));
  }

  private async getHtmlContent(
    templateName: string,
    replacements: Record<string, string>,
  ): Promise<string> {
    const templatePath = path.join(
      process.cwd(),
      'src',
      'email',
      'templates',
      `${templateName}.html`,
    );
    let content = await fs.promises.readFile(templatePath, 'utf-8');

    for (const key in replacements) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      content = content.replace(regex, replacements[key]);
    }

    return content;
  }

  async sendEmail({ to, subject, templateName, replacements }: EmailOptions) {
    try {
      const html = await this.getHtmlContent(templateName, replacements);

      const { data, error } = await this.resend.emails.send({
        from: 'Mercado Copado <noreply@mercadocopado.com>',
        to: [to],
        subject,
        html,
      });

      if (error) {
        console.error({ message: `Error sending email to ${to}`, error });
        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : JSON.stringify(error);
        throw new Error(`Failed to send email: ${errorMessage}`);
      }

      console.log({ message: `Email sent successfully to ${to}`, data });
      return data;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : JSON.stringify(error);
      console.error(`Failed to send email: ${errorMessage}`);
      throw new Error(`Failed to send email: ${errorMessage}`);
    }
  }
}
