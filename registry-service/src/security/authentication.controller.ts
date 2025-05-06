import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';

import { AuthenticationService } from './authentication.service';
import { CurrentUser } from './current-user.decorator';
import type { AccountView, TokenPair } from './dto/sign-in.dto';
import { ChangePasswordDto, SignInDto } from './dto/sign-in.dto';
import { Public } from './roles.decorator';
import type { Principal } from './token.service';

class RefreshDto {
  refreshToken: string;
}

@Controller('auth')
export class AuthenticationController {
  constructor(private readonly auth: AuthenticationService) {}

  @Public()
  @Post('sign-in')
  @HttpCode(200)
  signIn(@Body() request: SignInDto): Promise<TokenPair> {
    return this.auth.signIn(request);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() request: RefreshDto): Promise<TokenPair> {
    return this.auth.refresh(request?.refreshToken ?? '');
  }

  @Post('password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() principal: Principal,
    @Body() request: ChangePasswordDto,
  ): Promise<void> {
    await this.auth.changePassword(principal.username, request);
  }

  @Get('me')
  async me(@CurrentUser() principal: Principal): Promise<AccountView> {
    const accounts = await this.auth.list();
    const mine = accounts.find((account) => account.username === principal.username);

    return mine as AccountView;
  }
}
