function dumpTable(t, indent)
    if not indent then indent = 0 end
    for key, value in pairs(t) do
        local keyType = type(key)
        local valueType = type(value)

        -- Indent for better readability
        local indentation = string.rep("  ", indent)

        -- Print the key and value types, recursively if it's a table
        if valueType == "table" then
            print(string.format("%s%s (%s):", indentation, tostring(key), keyType))
            dumpTable(value, indent + 1)  -- Recursive call for nested tables
        else
            print(string.format("%s%s (%s): %s (%s)", indentation, tostring(key), keyType, tostring(value), valueType))
        end
    end
end

dumpTable(myG)
