// Nexus — Software Subscriptions: shared types

export type SubscriptionStatus =
	| "active"
	| "expiring_soon"
	| "expired"
	| "cancelled";

export type BillingCycle = "monthly" | "annual" | "one_time";

export type SeatRequestStatus = "pending" | "approved" | "rejected";

export interface SeatAllocation {
	id: string;
	user: string;
	user_name: string;
	user_email: string;
	allocated_at: string;
}

export interface Subscription {
	id: string;
	software_name: string;
	vendor: string;
	plan_name: string;
	license_key: string;
	total_seats: number;
	allocated_seats: number;
	available_seats: number;
	cost_per_seat: string | null;
	currency: string;
	billing_cycle: BillingCycle;
	total_annual_cost: string | null;
	purchase_date: string;
	expiry_date: string;
	days_until_expiry: number;
	renewal_url: string;
	notes: string;
	status: SubscriptionStatus;
	is_cancelled: boolean;
	allocations: SeatAllocation[];
	pending_request_count: number;
	created_by_name: string;
	created_at: string;
	updated_at: string;
}

export interface SeatRequest {
	id: string;
	subscription: string;
	software_name: string;
	vendor: string;
	requested_by: string;
	requested_by_name: string;
	requested_by_email: string;
	purpose: string;
	status: SeatRequestStatus;
	reviewed_by: string | null;
	reviewed_by_name: string;
	review_note: string;
	created_at: string;
	reviewed_at: string | null;
}

/** Payload for creating / editing a subscription (admin only). */
export interface SubscriptionFormValues {
	software_name: string;
	vendor: string;
	plan_name: string;
	license_key: string;
	total_seats: number;
	cost_per_seat: string;
	currency: string;
	billing_cycle: BillingCycle;
	purchase_date: string;
	expiry_date: string;
	renewal_url: string;
	notes: string;
}

export const emptySubscriptionForm: SubscriptionFormValues = {
	software_name: "",
	vendor: "",
	plan_name: "",
	license_key: "",
	total_seats: 1,
	cost_per_seat: "",
	currency: "KES",
	billing_cycle: "annual",
	purchase_date: "",
	expiry_date: "",
	renewal_url: "",
	notes: "",
};
