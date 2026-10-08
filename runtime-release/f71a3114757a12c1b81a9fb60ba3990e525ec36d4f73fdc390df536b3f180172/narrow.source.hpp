#include "tracecode_runtime.hpp"

template class tracecode::Vector<int>;
template class tracecode::IndexedRangeReadIterator<tracecode::Vector<int>>;
template class tracecode::IndexedRangeReadable<tracecode::Vector<int>>;
template std::vector<int> tracecode::json_to<std::vector<int>>(const tracecode::JsonValue&);
template std::vector<int> tracecode::read_json_input<std::vector<int>>(
  const tracecode::JsonValue&, const std::string&, std::size_t);
template void tracecode::emit_snapshot_value<tracecode::Vector<int>>(
  const std::string&, const tracecode::Vector<int>&, int);
template std::string tracecode::to_json<int>(const std::vector<int>&);
template tracecode::IndexedRangeReadable<tracecode::Vector<int>>
tracecode::indexed_range_readable<int>(
  tracecode::Vector<int>&, int, const char*, const char*);
