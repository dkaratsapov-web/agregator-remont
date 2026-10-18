import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OAUTH_CONFIG, loadOAuthConfig } from './oauth.config';
import { MeOAuthController, OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';

@Module({
  imports: [AuthModule],
  controllers: [OAuthController, MeOAuthController],
  providers: [OAuthService, { provide: OAUTH_CONFIG, useFactory: () => loadOAuthConfig() }],
})
export class OAuthModule {}
