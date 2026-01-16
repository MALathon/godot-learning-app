import { getTopicExtension } from '$lib/server/storage';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const extension = getTopicExtension(params.id);
	return {
		extension
	};
};
