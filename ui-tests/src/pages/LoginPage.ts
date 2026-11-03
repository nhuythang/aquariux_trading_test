import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  readonly demoTab = this.testId('tab-login-account-type-demo');
  readonly accountId = this.testId('login-user-id');
  readonly password = this.testId('login-password');
  readonly submit = this.testId('login-submit');

  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    await this.page.goto('/web/login');
  }

  async login(accountId: string, password: string): Promise<void> {
    await this.demoTab.click();
    await this.accountId.fill(accountId);
    await this.password.fill(password);
    await this.submit.click();
  }
}
