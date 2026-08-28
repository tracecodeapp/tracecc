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


template class tracecode::Vector<std::vector<int>>;
template class tracecode::IndexedRangeReadIterator<tracecode::Vector<std::vector<int>>>;
template class tracecode::IndexedRangeReadable<tracecode::Vector<std::vector<int>>>;
template std::vector<std::vector<int>> tracecode::json_to<std::vector<std::vector<int>>>(
  const tracecode::JsonValue&);
template std::vector<std::vector<int>> tracecode::read_json_input<std::vector<std::vector<int>>>(
  const tracecode::JsonValue&, const std::string&, std::size_t);
template void tracecode::emit_snapshot_value<tracecode::Vector<std::vector<int>>>(
  const std::string&, const tracecode::Vector<std::vector<int>>&, int);
template std::string tracecode::to_json<std::vector<int>>(
  const std::vector<std::vector<int>>&);
template tracecode::IndexedRangeReadable<tracecode::Vector<std::vector<int>>>
tracecode::indexed_range_readable<std::vector<int>>(
  tracecode::Vector<std::vector<int>>&, int, const char*, const char*);


template class tracecode::Vector<std::string>;
template class tracecode::IndexedRangeReadIterator<tracecode::Vector<std::string>>;
template class tracecode::IndexedRangeReadable<tracecode::Vector<std::string>>;
template std::vector<std::string> tracecode::json_to<std::vector<std::string>>(
  const tracecode::JsonValue&);
template std::vector<std::string> tracecode::read_json_input<std::vector<std::string>>(
  const tracecode::JsonValue&, const std::string&, std::size_t);
template void tracecode::emit_snapshot_value<tracecode::Vector<std::string>>(
  const std::string&, const tracecode::Vector<std::string>&, int);
template std::string tracecode::to_json<std::string>(
  const std::vector<std::string>&);
template tracecode::IndexedRangeReadable<tracecode::Vector<std::string>>
tracecode::indexed_range_readable<std::string>(
  tracecode::Vector<std::string>&, int, const char*, const char*);


template class tracecode::Vector<char>;
template class tracecode::IndexedRangeReadIterator<tracecode::Vector<char>>;
template class tracecode::IndexedRangeReadable<tracecode::Vector<char>>;
template std::vector<char> tracecode::json_to<std::vector<char>>(
  const tracecode::JsonValue&);
template std::vector<char> tracecode::read_json_input<std::vector<char>>(
  const tracecode::JsonValue&, const std::string&, std::size_t);
template void tracecode::emit_snapshot_value<tracecode::Vector<char>>(
  const std::string&, const tracecode::Vector<char>&, int);
template std::string tracecode::to_json<char>(
  const std::vector<char>&);
template tracecode::IndexedRangeReadable<tracecode::Vector<char>>
tracecode::indexed_range_readable<char>(
  tracecode::Vector<char>&, int, const char*, const char*);


template class tracecode::Vector<std::vector<char>>;
template class tracecode::IndexedRangeReadIterator<tracecode::Vector<std::vector<char>>>;
template class tracecode::IndexedRangeReadable<tracecode::Vector<std::vector<char>>>;
template std::vector<std::vector<char>> tracecode::json_to<std::vector<std::vector<char>>>(
  const tracecode::JsonValue&);
template std::vector<std::vector<char>> tracecode::read_json_input<std::vector<std::vector<char>>>(
  const tracecode::JsonValue&, const std::string&, std::size_t);
template void tracecode::emit_snapshot_value<tracecode::Vector<std::vector<char>>>(
  const std::string&, const tracecode::Vector<std::vector<char>>&, int);
template std::string tracecode::to_json<std::vector<char>>(
  const std::vector<std::vector<char>>&);
template tracecode::IndexedRangeReadable<tracecode::Vector<std::vector<char>>>
tracecode::indexed_range_readable<std::vector<char>>(
  tracecode::Vector<std::vector<char>>&, int, const char*, const char*);


template class tracecode::Vector<std::vector<std::string>>;
template class tracecode::IndexedRangeReadIterator<tracecode::Vector<std::vector<std::string>>>;
template class tracecode::IndexedRangeReadable<tracecode::Vector<std::vector<std::string>>>;
template std::vector<std::vector<std::string>> tracecode::json_to<std::vector<std::vector<std::string>>>(
  const tracecode::JsonValue&);
template std::vector<std::vector<std::string>> tracecode::read_json_input<std::vector<std::vector<std::string>>>(
  const tracecode::JsonValue&, const std::string&, std::size_t);
template void tracecode::emit_snapshot_value<tracecode::Vector<std::vector<std::string>>>(
  const std::string&, const tracecode::Vector<std::vector<std::string>>&, int);
template std::string tracecode::to_json<std::vector<std::string>>(
  const std::vector<std::vector<std::string>>&);
template tracecode::IndexedRangeReadable<tracecode::Vector<std::vector<std::string>>>
tracecode::indexed_range_readable<std::vector<std::string>>(
  tracecode::Vector<std::vector<std::string>>&, int, const char*, const char*);


template class tracecode::Vector<double>;
template class tracecode::IndexedRangeReadIterator<tracecode::Vector<double>>;
template class tracecode::IndexedRangeReadable<tracecode::Vector<double>>;
template std::vector<double> tracecode::json_to<std::vector<double>>(
  const tracecode::JsonValue&);
template std::vector<double> tracecode::read_json_input<std::vector<double>>(
  const tracecode::JsonValue&, const std::string&, std::size_t);
template void tracecode::emit_snapshot_value<tracecode::Vector<double>>(
  const std::string&, const tracecode::Vector<double>&, int);
template std::string tracecode::to_json<double>(
  const std::vector<double>&);
template tracecode::IndexedRangeReadable<tracecode::Vector<double>>
tracecode::indexed_range_readable<double>(
  tracecode::Vector<double>&, int, const char*, const char*);


template int tracecode::read_json_input<int>(
  const tracecode::JsonValue&, const std::string&, std::size_t);
template long long tracecode::read_json_input<long long>(
  const tracecode::JsonValue&, const std::string&, std::size_t);
template bool tracecode::read_json_input<bool>(
  const tracecode::JsonValue&, const std::string&, std::size_t);
template double tracecode::read_json_input<double>(
  const tracecode::JsonValue&, const std::string&, std::size_t);
template char tracecode::read_json_input<char>(
  const tracecode::JsonValue&, const std::string&, std::size_t);
template std::string tracecode::read_json_input<std::string>(
  const tracecode::JsonValue&, const std::string&, std::size_t);


template class tracecode::Vector<std::variant<std::string, int>>;
template class tracecode::IndexedRangeReadIterator<tracecode::Vector<std::variant<std::string, int>>>;
template class tracecode::IndexedRangeReadable<tracecode::Vector<std::variant<std::string, int>>>;
template std::vector<std::variant<std::string, int>> tracecode::json_to<std::vector<std::variant<std::string, int>>>(
  const tracecode::JsonValue&);
template std::vector<std::variant<std::string, int>> tracecode::read_json_input<std::vector<std::variant<std::string, int>>>(
  const tracecode::JsonValue&, const std::string&, std::size_t);
template void tracecode::emit_snapshot_value<tracecode::Vector<std::variant<std::string, int>>>(
  const std::string&, const tracecode::Vector<std::variant<std::string, int>>&, int);
template std::string tracecode::to_json<std::variant<std::string, int>>(
  const std::vector<std::variant<std::string, int>>&);
template tracecode::IndexedRangeReadable<tracecode::Vector<std::variant<std::string, int>>>
tracecode::indexed_range_readable<std::variant<std::string, int>>(
  tracecode::Vector<std::variant<std::string, int>>&, int, const char*, const char*);


template class tracecode::Vector<std::vector<std::variant<std::string, int>>>;
template class tracecode::IndexedRangeReadIterator<tracecode::Vector<std::vector<std::variant<std::string, int>>>>;
template class tracecode::IndexedRangeReadable<tracecode::Vector<std::vector<std::variant<std::string, int>>>>;
template std::vector<std::vector<std::variant<std::string, int>>> tracecode::json_to<std::vector<std::vector<std::variant<std::string, int>>>>(
  const tracecode::JsonValue&);
template std::vector<std::vector<std::variant<std::string, int>>> tracecode::read_json_input<std::vector<std::vector<std::variant<std::string, int>>>>(
  const tracecode::JsonValue&, const std::string&, std::size_t);
template void tracecode::emit_snapshot_value<tracecode::Vector<std::vector<std::variant<std::string, int>>>>(
  const std::string&, const tracecode::Vector<std::vector<std::variant<std::string, int>>>&, int);
template std::string tracecode::to_json<std::vector<std::variant<std::string, int>>>(
  const std::vector<std::vector<std::variant<std::string, int>>>&);
template tracecode::IndexedRangeReadable<tracecode::Vector<std::vector<std::variant<std::string, int>>>>
tracecode::indexed_range_readable<std::vector<std::variant<std::string, int>>>(
  tracecode::Vector<std::vector<std::variant<std::string, int>>>&, int, const char*, const char*);


template class tracecode::UnorderedMap<std::string, std::string>;
template class tracecode::UnorderedMap<
  std::string, std::variant<std::string, int>>;
template class tracecode::Map<std::string, std::set<std::string>>;
template class tracecode::Map<std::string, std::variant<std::string, int>>;
template class tracecode::Set<std::string>;
template void tracecode::emit_snapshot_value<
  tracecode::UnorderedMap<std::string, std::string>>(
  const std::string&,
  const tracecode::UnorderedMap<std::string, std::string>&,
  int);
template void tracecode::emit_snapshot_value<
  tracecode::UnorderedMap<std::string, std::variant<std::string, int>>>(
  const std::string&,
  const tracecode::UnorderedMap<
    std::string, std::variant<std::string, int>>&,
  int);
template void tracecode::emit_snapshot_value<
  tracecode::Map<std::string, std::set<std::string>>>(
  const std::string&,
  const tracecode::Map<std::string, std::set<std::string>>&,
  int);
template void tracecode::emit_snapshot_value<tracecode::Set<std::string>>(
  const std::string&, const tracecode::Set<std::string>&, int);
