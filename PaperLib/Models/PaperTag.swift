//
//  PaperTag.swift
//  PaperLib
//
//  Created by GeoffreyChen on 26/11/2021.
//

import Foundation
import RealmSwift


class PaperTag: Object, ObjectKeyIdentifiable {
      
    @Persisted var id: String = ""
    @Persisted var count: Int = 1
    @Persisted var name: String = ""

    
    convenience init(id: String) {
        self.init()
        self.id = "tag-"+id
        self.name = id
    }
    
    override static func primaryKey() -> String {
        return "id"
    }
}