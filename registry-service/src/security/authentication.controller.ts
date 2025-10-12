import { Body, Controller, Get, HttpCode, Ip, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AuthenticationService } from './authentication.service';
import { CurrentUser } from './current-user.decorator';
import type { AccountView, TokenPair } from './dto/sign-in.dto';
import { ChangePasswordDto, RefreshDto, SignInDto } from './dto/sign-in.dto';
import { Public } from './roles.decorator';
import type { Principal } from './token.service';

@ApiTags('accounts')
@ApiBearerAuth('registry-token')
@Controller('auth')
export class AuthenticationController {
  constructor(private readonly auth: AuthenticationService) {}

  @Public()
  @Post('sign-in')
  @HttpCode(200)
  signIn(@Body() request: SignInDto, @Ip() from: string): Promise<TokenPair> {
    return this.auth.signIn(request, from);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() request: RefreshDto): Promise<TokenPair> {
    return this.auth.refresh(request.refreshToken);
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
