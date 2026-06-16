import { AccountType, AccountStatus, CurrencyCode } from '../../common/enums';
import { Actor } from '../customer/customer.dto';

/**
 * Request shapes for the Account registry (SRS §4.1, FIN-CUST-002).
 * A customer may hold multiple accounts across types: stand_purchase,
 * agro_purchase, rental, utility.
 */
export interface CreateAccountDto extends Actor {
  customerId: string;
  accountType: AccountType;
  /** Human-readable account number. Auto-generated if omitted (UNIQUE in DB). */
  reference?: string;
  status?: AccountStatus;
  currency?: CurrencyCode;
}
