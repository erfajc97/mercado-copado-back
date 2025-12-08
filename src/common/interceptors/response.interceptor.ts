import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface SuccessResponse<T> {
  statusCode: number;
  message: string;
  content: T;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  SuccessResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<SuccessResponse<T>> {
    const response = context.switchToHttp().getResponse();
    const statusCode = response.statusCode;

    return next.handle().pipe(
      map((data) => {
        // Si la respuesta ya fue enviada (por ejemplo, con redirect o cookies),
        // no intentar envolverla para evitar ERR_HTTP_HEADERS_SENT
        if (response.headersSent) {
          return data as unknown as SuccessResponse<T>;
        }

        return {
          statusCode,
          message: data?.message || 'Success',
          content: data?.data === undefined ? data : data.data,
        };
      }),
    );
  }
}
