import React, { useState, useEffect, useRef } from 'react';
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Globe, Server, Check, ChevronDown, ChevronRight } from "lucide-react";

export function NodeSelector({ groups = {}, onSelectionChange, disabled }) {
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [customNodes, setCustomNodes] = useState([]);
    const [customName, setCustomName] = useState('');
    const [customUrl, setCustomUrl] = useState('');
    // Track expanded state for each group key
    const [expandedGroups, setExpandedGroups] = useState({});
    const hasInitializedSelectionRef = useRef(false);

    // Flatten available nodes for easier lookup
    const getAllNodes = () => {
        let nodes = [];
        Object.values(groups).forEach(g => {
            nodes = [...nodes, ...g.nodes];
        });
        return [...nodes, ...customNodes];
    };

    useEffect(() => {
        const allNodes = getAllNodes();
        const selected = allNodes.filter(n => selectedIds.has(n.id));
        onSelectionChange(selected);
    }, [selectedIds, customNodes, groups]);

    useEffect(() => {
        if (hasInitializedSelectionRef.current) return;

        const configuredNodes = Object.values(groups).flatMap(g => g.nodes || []);
        if (configuredNodes.length === 0) return;

        hasInitializedSelectionRef.current = true;
        setSelectedIds(new Set(configuredNodes.map(n => n.id)));
        
        // Default: all groups collapsed initially
        const initialExpanded = {};
        Object.keys(groups).forEach(key => {
            initialExpanded[key] = false;
        });
        setExpandedGroups(initialExpanded);
    }, [groups]);

    const toggleNode = (id) => {
        if (disabled) return;
        const next = new Set(selectedIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setSelectedIds(next);
    };

    const toggleGroupSelection = (e, groupNodes) => {
        e.stopPropagation(); // Prevent accordion toggle
        if (disabled) return;
        const next = new Set(selectedIds);
        const allSelected = groupNodes.every(n => next.has(n.id));

        if (allSelected) {
            groupNodes.forEach(n => next.delete(n.id));
        } else {
            groupNodes.forEach(n => next.add(n.id));
        }
        setSelectedIds(next);
    };

    const toggleExpand = (key) => {
        setExpandedGroups(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const addCustomNode = () => {
        if (!customName || !customUrl) return;
        const newNode = {
            id: `custom-${Date.now()}`,
            name: customName,
            url: customUrl
        };
        setCustomNodes([...customNodes, newNode]);
        setCustomName('');
        setCustomUrl('');
        setSelectedIds(new Set([...selectedIds, newNode.id]));
    };

    const removeCustomNode = (id) => {
        setCustomNodes(customNodes.filter(n => n.id !== id));
        const next = new Set(selectedIds);
        next.delete(id);
        setSelectedIds(next);
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-1 overflow-y-auto pr-2 space-y-2 hover:pr-1 transition-all custom-scrollbar">
                {/* No Groups State */}
                {Object.keys(groups).length === 0 && customNodes.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground opacity-50">
                        <Server className="h-10 w-10 mb-2" />
                        <span className="text-sm">No node configurations</span>
                    </div>
                )}

                {Object.entries(groups).map(([key, group]) => {
                    const isExpanded = expandedGroups[key];
                    const groupSelectedCount = group.nodes.filter(n => selectedIds.has(n.id)).length;
                    const isAllSelected = group.nodes.length > 0 && groupSelectedCount === group.nodes.length;
                    const isPartiallySelected = groupSelectedCount > 0 && !isAllSelected;

                    return (
                        <div key={key} className="border border-muted/30 rounded-lg overflow-hidden bg-card/30">
                            <div 
                                className="flex items-center justify-between group cursor-pointer p-3 hover:bg-muted/30 transition-colors select-none"
                                onClick={() => toggleExpand(key)}
                            >
                                <div className="flex items-center space-x-3 min-w-0">
                                    <div 
                                        className={`w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0 ${
                                            isAllSelected ? "bg-primary border-primary text-primary-foreground" : 
                                            isPartiallySelected ? "bg-primary/20 border-primary text-primary" : "border-muted-foreground bg-background"
                                        }`}
                                        onClick={(e) => toggleGroupSelection(e, group.nodes)}
                                    >
                                       {isAllSelected && <Check className="h-3.5 w-3.5" />}
                                       {isPartiallySelected && <div className="h-2 w-2 rounded-full bg-current" />}
                                    </div>
                                    
                                    <div className="flex items-center gap-2 min-w-0">
                                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-foreground/90 truncate group-hover:text-primary transition-colors">
                                            {group.name}
                                        </h4>
                                    </div>
                                </div>
                                <Badge variant={isAllSelected ? "default" : "secondary"} className="text-[10px] h-5 px-1.5 shrink-0 tabular-nums">
                                    {groupSelectedCount}/{group.nodes.length}
                                </Badge>
                            </div>
                            
                            {isExpanded && (
                                <div className="grid gap-1.5 p-2 pt-0 animate-in fade-in slide-in-from-top-1 duration-200">
                                    {group.nodes.map(node => {
                                        const isSelected = selectedIds.has(node.id);
                                        return (
                                            <div 
                                                key={node.id} 
                                                onClick={() => toggleNode(node.id)}
                                                className={`
                                                    relative flex items-center space-x-3 p-2 rounded-md border cursor-pointer transition-all duration-200 group
                                                    ${isSelected 
                                                        ? 'bg-primary/10 border-primary/30 shadow-sm' 
                                                        : 'bg-background/50 hover:bg-muted/40 border-transparent hover:border-muted/50'
                                                    }
                                                    ${disabled ? 'opacity-50 pointer-events-none' : ''}
                                                `}
                                            >
                                                <div className={`
                                                    flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors
                                                    ${isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted bg-muted/20 text-muted-foreground group-hover:border-primary/50'}
                                                `}>
                                                    <Globe className="h-3.5 w-3.5" />
                                                </div>
                                                
                                                <div className="flex-1 min-w-0 grid gap-0">
                                                    <div className={`text-[13px] font-medium truncate transition-colors ${isSelected ? 'text-primary' : 'text-foreground/80'}`}>
                                                        {node.name}
                                                    </div>
                                                    <div className="text-[9px] text-muted-foreground/60 truncate font-mono opacity-80 group-hover:opacity-100">
                                                        {node.url}
                                                    </div>
                                                </div>

                                                {isSelected && (
                                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-primary" />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Custom Group */}
                {customNodes.length > 0 && (
                    <div className="border border-dashed border-muted/50 rounded-lg overflow-hidden bg-muted/5">
                         <div className="flex items-center justify-between p-3 border-b border-dashed border-muted/30">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Custom Nodes</h4>
                            <Badge variant="outline" className="text-[10px] h-5">{customNodes.length}</Badge>
                        </div>
                        <div className="grid gap-1.5 p-2">
                            {customNodes.map(node => (
                                <div 
                                    key={node.id} 
                                    className={`
                                        flex items-center space-x-3 p-2 rounded-md border border-dashed border-muted bg-muted/10
                                        ${selectedIds.has(node.id) ? 'ring-1 ring-primary/20 bg-primary/5' : ''}
                                    `}
                                >
                                     <Checkbox
                                        id={`node-${node.id}`}
                                        checked={selectedIds.has(node.id)}
                                        onCheckedChange={() => toggleNode(node.id)}
                                        disabled={disabled}
                                    />
                                    <div className="flex-1 min-w-0 grid gap-0">
                                        <div className="text-[13px] font-medium truncate">{node.name}</div>
                                        <div className="text-[9px] text-muted-foreground truncate">{node.url}</div>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full" onClick={() => removeCustomNode(node.id)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="pt-4 mt-2 border-t bg-card/50 backdrop-blur-sm">
                <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase text-muted-foreground">Add Custom Target</Label>
                    <div className="grid gap-2">
                        <Input
                            placeholder="Name"
                            value={customName}
                            onChange={e => setCustomName(e.target.value)}
                            disabled={disabled}
                            className="h-8 text-sm bg-muted/20"
                        />
                        <div className="flex gap-2">
                            <Input
                                placeholder="URL (https://...)"
                                value={customUrl}
                                onChange={e => setCustomUrl(e.target.value)}
                                disabled={disabled}
                                className="h-8 text-sm bg-muted/20"
                            />
                            <Button size="icon" className="h-8 w-8 shrink-0" onClick={addCustomNode} disabled={disabled || !customName || !customUrl}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
