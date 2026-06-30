import React from "react";
import { Table as AntTable } from "antd";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";

const getValue = (record, dataIndex) => {
  if (!dataIndex) return undefined;
  if (Array.isArray(dataIndex)) {
    return dataIndex.reduce((value, key) => value?.[key], record);
  }
  return record?.[dataIndex];
};

const renderCell = (column, record, index) => {
  const value = getValue(record, column.dataIndex);
  if (typeof column.render === "function") {
    return column.render(value, record, index);
  }
  if (value === undefined || value === null || value === "") return "-";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
};

const titleText = (title) => {
  if (typeof title === "string") return title;
  if (typeof title === "number") return String(title);
  return "";
};

function ResponsiveAntTable({
  columns = [],
  dataSource = [],
  rowKey = "_id",
  mobileTitle,
  cardsAlways = false,
  className = "",
  ...tableProps
}) {
  const visibleColumns = columns.filter((column) => titleText(column.title));
  const actionColumn = columns.find((column) => titleText(column.title).toLowerCase() === "action");
  const detailColumns = visibleColumns.filter((column) => column !== actionColumn);

  const getKey = (record, index) => {
    if (typeof rowKey === "function") return rowKey(record);
    return record?.[rowKey] || record?.key || index;
  };

  return (
    <div className={`responsive-table-wrap ${cardsAlways ? "responsive-table-cards-always" : ""} ${className}`.trim()}>
      <div className="responsive-table-desktop">
        <AntTable columns={columns} dataSource={dataSource} rowKey={rowKey} {...tableProps} />
      </div>
      <div className="responsive-table-mobile">
        {dataSource?.length ? (
          dataSource.map((record, index) => (
            <Card className="responsive-row-card" key={getKey(record, index)}>
              <CardContent>
                <div className="responsive-row-card-header">
                  <strong>
                    {mobileTitle ? mobileTitle(record) : renderCell(detailColumns[0] || {}, record, index)}
                  </strong>
                  {record.status && <Badge variant="outline">{record.status}</Badge>}
                </div>
                <div className="responsive-row-fields">
                  {detailColumns.map((column) => (
                    <div className="responsive-row-field" key={`${getKey(record, index)}-${titleText(column.title)}`}>
                      <span>{titleText(column.title)}</span>
                      <div>{renderCell(column, record, index)}</div>
                    </div>
                  ))}
                </div>
                {actionColumn && (
                  <div className="responsive-row-actions">
                    {renderCell(actionColumn, record, index)}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="responsive-row-card">
            <CardContent>
              <p className="responsive-empty">No data available.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default ResponsiveAntTable;
