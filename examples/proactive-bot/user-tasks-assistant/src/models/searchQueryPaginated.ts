interface SearchQueryPaginated {
  query: string;
  limit: number;
  pageOffset: number;
  cached: boolean;
}

export default SearchQueryPaginated;
