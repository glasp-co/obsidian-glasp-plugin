type Constructor = {
	status: number;
	message?: string;
};

export class APIError extends Error {
	public status: number;
	public message: string;

	constructor({ status, message }: Constructor) {
		super();
		this.status = status;
		this.message = message ?? "";
	}
}
